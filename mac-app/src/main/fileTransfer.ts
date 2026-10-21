import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FILE_CHUNK_BYTES, type Envelope } from '@phonelink/shared';

export interface TransferProgress {
  fileName: string;
  direction: 'sending' | 'receiving';
  done: number;
  total: number;
}

export interface FileTransferEvents {
  progress: [TransferProgress | null];
  received: [string];
  /** A file we sent reached the phone in full; carries the file name. */
  sent: [string];
  error: [string];
}

interface Incoming {
  fileName: string;
  handle: fsp.FileHandle;
  tempPath: string;
  written: number;
  total: number;
}

/** Where completed downloads land. */
function downloadsDir(): string {
  return path.join(os.homedir(), 'Downloads', 'PhoneLinkClone');
}

/**
 * Chunked file transfer for the Mac.
 *
 * Chunks are written at their own offset rather than appended, so out-of-order and duplicate
 * chunks are harmless. Files are assembled in a temp directory and only moved into Downloads on
 * `file_complete`, so a dropped link never leaves a plausible-looking partial file there.
 */
export class FileTransfers extends EventEmitter<FileTransferEvents> {
  private readonly incoming = new Map<string, Incoming>();

  async handle(envelope: Envelope, send: (envelope: Envelope) => boolean): Promise<void> {
    switch (envelope.type) {
      case 'file_offer':
        await this.begin(envelope.fileId, envelope.fileName, envelope.sizeBytes);
        return;
      case 'file_chunk':
        await this.write(envelope.fileId, envelope.chunkIndex, envelope.totalChunks, envelope.data);
        return;
      case 'file_complete':
        await this.finish(envelope.fileId);
        return;
      default:
        void send;
    }
  }

  /** Sends a local file in chunks, respecting socket backpressure. */
  async send(
    filePath: string,
    dispatch: (envelope: Envelope) => boolean,
    isDrained: () => boolean,
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const stat = await fsp.stat(filePath);
    const totalChunks = Math.max(1, Math.ceil(stat.size / FILE_CHUNK_BYTES));
    const fileId = `${Date.now()}-${fileName}`;

    if (
      !dispatch({
        type: 'file_offer',
        fileId,
        fileName,
        sizeBytes: stat.size,
        mimeType: 'application/octet-stream',
      })
    ) {
      this.emit('error', 'Not connected to your phone.');
      return;
    }

    const handle = await fsp.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(FILE_CHUNK_BYTES);
      for (let index = 0; index < totalChunks; index += 1) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          FILE_CHUNK_BYTES,
          index * FILE_CHUNK_BYTES,
        );
        const chunk = buffer.subarray(0, bytesRead).toString('base64');
        if (
          !dispatch({
            type: 'file_chunk',
            fileId,
            chunkIndex: index,
            totalChunks,
            data: chunk,
          })
        ) {
          this.emit('error', 'Connection lost during transfer.');
          this.emit('progress', null);
          return;
        }
        this.emit('progress', {
          fileName,
          direction: 'sending',
          done: index + 1,
          total: totalChunks,
        });
        // Wait for the socket to drain so a large file cannot balloon the send buffer.
        await waitFor(isDrained);
      }
      dispatch({ type: 'file_complete', fileId });
      this.emit('sent', fileName);
    } finally {
      await handle.close();
      this.emit('progress', null);
    }
  }

  /** Drops every partial transfer; called when the link goes away. */
  async abortAll(): Promise<void> {
    for (const [fileId, transfer] of this.incoming) {
      await transfer.handle.close().catch(() => undefined);
      await fsp.rm(transfer.tempPath, { force: true }).catch(() => undefined);
      this.incoming.delete(fileId);
    }
    this.emit('progress', null);
  }

  private async begin(fileId: string, fileName: string, sizeBytes: number): Promise<void> {
    try {
      const tempDir = path.join(os.tmpdir(), 'phonelink-transfers');
      await fsp.mkdir(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `${fileId.replace(/[^\w.-]/g, '_')}.part`);
      const handle = await fsp.open(tempPath, 'w+');
      this.incoming.set(fileId, {
        fileName,
        handle,
        tempPath,
        written: 0,
        total: Math.max(1, Math.ceil(sizeBytes / FILE_CHUNK_BYTES)),
      });
      this.emit('progress', {
        fileName,
        direction: 'receiving',
        done: 0,
        total: Math.max(1, Math.ceil(sizeBytes / FILE_CHUNK_BYTES)),
      });
    } catch (error) {
      this.emit('error', `Could not start receiving: ${(error as Error).message}`);
    }
  }

  private async write(
    fileId: string,
    chunkIndex: number,
    totalChunks: number,
    data: string,
  ): Promise<void> {
    const transfer = this.incoming.get(fileId);
    if (!transfer) return; // a chunk for a transfer we never started
    try {
      const buffer = Buffer.from(data, 'base64');
      // Positional write: order does not matter, and a duplicate simply rewrites the same bytes.
      await transfer.handle.write(buffer, 0, buffer.length, chunkIndex * FILE_CHUNK_BYTES);
      transfer.written += 1;
      transfer.total = totalChunks;
      this.emit('progress', {
        fileName: transfer.fileName,
        direction: 'receiving',
        done: Math.min(transfer.written, totalChunks),
        total: totalChunks,
      });
    } catch (error) {
      this.emit('error', `Writing the file failed: ${(error as Error).message}`);
    }
  }

  private async finish(fileId: string): Promise<void> {
    const transfer = this.incoming.get(fileId);
    if (!transfer) return;
    this.incoming.delete(fileId);
    try {
      await transfer.handle.close();
      await fsp.mkdir(downloadsDir(), { recursive: true });
      const target = await uniquePath(path.join(downloadsDir(), transfer.fileName));
      await fsp.rename(transfer.tempPath, target).catch(async error => {
        // rename fails across devices; fall back to a copy.
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        await fsp.copyFile(transfer.tempPath, target);
        await fsp.rm(transfer.tempPath, { force: true });
      });
      this.emit('received', target);
    } catch (error) {
      this.emit('error', `Saving the file failed: ${(error as Error).message}`);
    } finally {
      this.emit('progress', null);
    }
  }
}

/** Never silently overwrite an existing download. */
async function uniquePath(candidate: string): Promise<string> {
  if (!fs.existsSync(candidate)) return candidate;
  const dir = path.dirname(candidate);
  const ext = path.extname(candidate);
  const base = path.basename(candidate, ext);
  for (let n = 2; n < 1000; n += 1) {
    const next = path.join(dir, `${base} (${n})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

function waitFor(isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setInterval(() => {
      if (!isReady()) return;
      clearInterval(timer);
      resolve();
    }, 20);
  });
}
