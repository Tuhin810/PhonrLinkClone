import { useCallback, useRef, useState } from 'react';
import {
  FILE_CHUNK_BYTES,
  type Envelope,
  type FileChunkMessage,
  type FileOfferMessage,
} from '@phonelink/shared';
import { FileTransfer, type PickedFile } from '../native/fileTransfer';

export interface TransferProgress {
  fileName: string;
  direction: 'sending' | 'receiving';
  done: number;
  total: number;
}

interface Options {
  send(envelope: Envelope): boolean;
}

interface IncomingTransfer {
  token: string;
  fileName: string;
  mimeType: string;
  nextIndex: number;
  /** Chunks that arrived early, held until their turn. */
  buffered: Map<number, string>;
}

/**
 * Chunked file transfer for the phone.
 *
 * Chunks are appended to a temp file in arrival order, so anything arriving out of sequence is
 * buffered until its turn rather than corrupting the file; duplicates are dropped.
 */
export function useFileTransfer({ send }: Options) {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const incoming = useRef<Map<string, IncomingTransfer>>(new Map());

  const sendFile = useCallback(async () => {
    setError(null);
    let picked: PickedFile | null;
    try {
      picked = await FileTransfer.pickFile();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!picked) return; // cancelled

    const fileName = picked.name ?? 'file';
    const sizeBytes = picked.size ?? 0;
    if (sizeBytes === 0) {
      setError('That file is empty, or its size could not be read.');
      return;
    }

    const fileId = `${Date.now()}-${fileName}`;
    const totalChunks = Math.ceil(sizeBytes / FILE_CHUNK_BYTES);

    const offer: FileOfferMessage = {
      type: 'file_offer',
      fileId,
      fileName,
      sizeBytes,
      mimeType: picked.mimeType ?? 'application/octet-stream',
    };
    if (!send(offer)) {
      setError('Not connected to your Mac.');
      return;
    }

    setProgress({ fileName, direction: 'sending', done: 0, total: totalChunks });

    for (let index = 0; index < totalChunks; index += 1) {
      let data: string;
      try {
        data = await FileTransfer.readChunk(
          picked.uri,
          index * FILE_CHUNK_BYTES,
          FILE_CHUNK_BYTES,
        );
      } catch (e) {
        setError(`Reading the file failed: ${(e as Error).message}`);
        setProgress(null);
        return;
      }

      const chunk: FileChunkMessage = {
        type: 'file_chunk',
        fileId,
        chunkIndex: index,
        totalChunks,
        data,
      };
      // A dropped link aborts rather than silently producing a partial file on the Mac.
      if (!send(chunk)) {
        setError('Connection lost during transfer.');
        setProgress(null);
        return;
      }
      setProgress({ fileName, direction: 'sending', done: index + 1, total: totalChunks });
    }

    send({ type: 'file_complete', fileId });
    setProgress(null);
  }, [send]);

  const handleEnvelope = useCallback(async (envelope: Envelope) => {
    if (envelope.type === 'file_offer') {
      const total = Math.max(1, Math.ceil(envelope.sizeBytes / FILE_CHUNK_BYTES));
      try {
        const token = await FileTransfer.beginReceive(envelope.fileName);
        incoming.current.set(envelope.fileId, {
          token,
          fileName: envelope.fileName,
          mimeType: envelope.mimeType,
          nextIndex: 0,
          buffered: new Map(),
        });
        setProgress({
          fileName: envelope.fileName,
          direction: 'receiving',
          done: 0,
          total,
        });
      } catch (e) {
        setError(`Could not start receiving: ${(e as Error).message}`);
      }
      return;
    }

    if (envelope.type === 'file_chunk') {
      const transfer = incoming.current.get(envelope.fileId);
      if (!transfer) return; // a chunk for a transfer we never started
      if (envelope.chunkIndex < transfer.nextIndex) return; // duplicate

      transfer.buffered.set(envelope.chunkIndex, envelope.data);
      while (transfer.buffered.has(transfer.nextIndex)) {
        const data = transfer.buffered.get(transfer.nextIndex);
        transfer.buffered.delete(transfer.nextIndex);
        try {
          await FileTransfer.appendChunk(transfer.token, data ?? '');
        } catch (e) {
          setError(`Writing the file failed: ${(e as Error).message}`);
          FileTransfer.abortReceive(transfer.token);
          incoming.current.delete(envelope.fileId);
          setProgress(null);
          return;
        }
        transfer.nextIndex += 1;
      }
      setProgress({
        fileName: transfer.fileName,
        direction: 'receiving',
        done: transfer.nextIndex,
        total: envelope.totalChunks,
      });
      return;
    }

    if (envelope.type === 'file_complete') {
      const transfer = incoming.current.get(envelope.fileId);
      if (!transfer) return;
      incoming.current.delete(envelope.fileId);
      try {
        await FileTransfer.finishReceive(
          transfer.token,
          transfer.fileName,
          transfer.mimeType,
        );
      } catch (e) {
        setError(`Saving the file failed: ${(e as Error).message}`);
      }
      setProgress(null);
    }
  }, []);

  /** Drops partial transfers when the link goes away, so no temp files are orphaned. */
  const abortAll = useCallback(() => {
    for (const transfer of incoming.current.values()) {
      FileTransfer.abortReceive(transfer.token);
    }
    incoming.current.clear();
    setProgress(null);
  }, []);

  return { progress, error, sendFile, handleEnvelope, abortAll };
}
