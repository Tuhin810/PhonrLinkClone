"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTransfers = void 0;
const node_events_1 = require("node:events");
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const shared_1 = require("@phonelink/shared");
/** Where completed downloads land. */
function downloadsDir() {
    return node_path_1.default.join(node_os_1.default.homedir(), 'Downloads', 'PhoneLinkClone');
}
/**
 * Chunked file transfer for the Mac.
 *
 * Chunks are written at their own offset rather than appended, so out-of-order and duplicate
 * chunks are harmless. Files are assembled in a temp directory and only moved into Downloads on
 * `file_complete`, so a dropped link never leaves a plausible-looking partial file there.
 */
class FileTransfers extends node_events_1.EventEmitter {
    incoming = new Map();
    async handle(envelope, send) {
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
    async send(filePath, dispatch, isDrained) {
        const fileName = node_path_1.default.basename(filePath);
        const stat = await promises_1.default.stat(filePath);
        const totalChunks = Math.max(1, Math.ceil(stat.size / shared_1.FILE_CHUNK_BYTES));
        const fileId = `${Date.now()}-${fileName}`;
        if (!dispatch({
            type: 'file_offer',
            fileId,
            fileName,
            sizeBytes: stat.size,
            mimeType: 'application/octet-stream',
        })) {
            this.emit('error', 'Not connected to your phone.');
            return;
        }
        const handle = await promises_1.default.open(filePath, 'r');
        try {
            const buffer = Buffer.alloc(shared_1.FILE_CHUNK_BYTES);
            for (let index = 0; index < totalChunks; index += 1) {
                const { bytesRead } = await handle.read(buffer, 0, shared_1.FILE_CHUNK_BYTES, index * shared_1.FILE_CHUNK_BYTES);
                const chunk = buffer.subarray(0, bytesRead).toString('base64');
                if (!dispatch({
                    type: 'file_chunk',
                    fileId,
                    chunkIndex: index,
                    totalChunks,
                    data: chunk,
                })) {
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
        }
        finally {
            await handle.close();
            this.emit('progress', null);
        }
    }
    /** Drops every partial transfer; called when the link goes away. */
    async abortAll() {
        for (const [fileId, transfer] of this.incoming) {
            await transfer.handle.close().catch(() => undefined);
            await promises_1.default.rm(transfer.tempPath, { force: true }).catch(() => undefined);
            this.incoming.delete(fileId);
        }
        this.emit('progress', null);
    }
    async begin(fileId, fileName, sizeBytes) {
        try {
            const tempDir = node_path_1.default.join(node_os_1.default.tmpdir(), 'phonelink-transfers');
            await promises_1.default.mkdir(tempDir, { recursive: true });
            const tempPath = node_path_1.default.join(tempDir, `${fileId.replace(/[^\w.-]/g, '_')}.part`);
            const handle = await promises_1.default.open(tempPath, 'w+');
            this.incoming.set(fileId, {
                fileName,
                handle,
                tempPath,
                written: 0,
                total: Math.max(1, Math.ceil(sizeBytes / shared_1.FILE_CHUNK_BYTES)),
            });
            this.emit('progress', {
                fileName,
                direction: 'receiving',
                done: 0,
                total: Math.max(1, Math.ceil(sizeBytes / shared_1.FILE_CHUNK_BYTES)),
            });
        }
        catch (error) {
            this.emit('error', `Could not start receiving: ${error.message}`);
        }
    }
    async write(fileId, chunkIndex, totalChunks, data) {
        const transfer = this.incoming.get(fileId);
        if (!transfer)
            return; // a chunk for a transfer we never started
        try {
            const buffer = Buffer.from(data, 'base64');
            // Positional write: order does not matter, and a duplicate simply rewrites the same bytes.
            await transfer.handle.write(buffer, 0, buffer.length, chunkIndex * shared_1.FILE_CHUNK_BYTES);
            transfer.written += 1;
            transfer.total = totalChunks;
            this.emit('progress', {
                fileName: transfer.fileName,
                direction: 'receiving',
                done: Math.min(transfer.written, totalChunks),
                total: totalChunks,
            });
        }
        catch (error) {
            this.emit('error', `Writing the file failed: ${error.message}`);
        }
    }
    async finish(fileId) {
        const transfer = this.incoming.get(fileId);
        if (!transfer)
            return;
        this.incoming.delete(fileId);
        try {
            await transfer.handle.close();
            await promises_1.default.mkdir(downloadsDir(), { recursive: true });
            const target = await uniquePath(node_path_1.default.join(downloadsDir(), transfer.fileName));
            await promises_1.default.rename(transfer.tempPath, target).catch(async (error) => {
                // rename fails across devices; fall back to a copy.
                if (error.code !== 'EXDEV')
                    throw error;
                await promises_1.default.copyFile(transfer.tempPath, target);
                await promises_1.default.rm(transfer.tempPath, { force: true });
            });
            this.emit('received', target);
        }
        catch (error) {
            this.emit('error', `Saving the file failed: ${error.message}`);
        }
        finally {
            this.emit('progress', null);
        }
    }
}
exports.FileTransfers = FileTransfers;
/** Never silently overwrite an existing download. */
async function uniquePath(candidate) {
    if (!node_fs_1.default.existsSync(candidate))
        return candidate;
    const dir = node_path_1.default.dirname(candidate);
    const ext = node_path_1.default.extname(candidate);
    const base = node_path_1.default.basename(candidate, ext);
    for (let n = 2; n < 1000; n += 1) {
        const next = node_path_1.default.join(dir, `${base} (${n})${ext}`);
        if (!node_fs_1.default.existsSync(next))
            return next;
    }
    return node_path_1.default.join(dir, `${base}-${Date.now()}${ext}`);
}
function waitFor(isReady) {
    if (isReady())
        return Promise.resolve();
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (!isReady())
                return;
            clearInterval(timer);
            resolve();
        }, 20);
    });
}
