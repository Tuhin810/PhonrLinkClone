"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const fileTransfer_1 = require("../src/main/fileTransfer");
const downloads = node_path_1.default.join(node_os_1.default.homedir(), 'Downloads', 'PhoneLinkClone');
const written = [];
(0, node_test_1.after)(async () => {
    for (const file of written)
        await promises_1.default.rm(file, { force: true });
});
/** Captures the envelopes a send produces, without a socket. */
async function capture(filePath) {
    const sender = new fileTransfer_1.FileTransfers();
    const envelopes = [];
    await sender.send(filePath, envelope => {
        envelopes.push(envelope);
        return true;
    }, () => true);
    return envelopes;
}
/** Feeds envelopes into a receiver and resolves with the saved path. */
async function receive(envelopes) {
    const receiver = new fileTransfer_1.FileTransfers();
    const saved = new Promise((resolve, reject) => {
        receiver.on('received', resolve);
        receiver.on('error', message => reject(new Error(message)));
    });
    for (const envelope of envelopes) {
        await receiver.handle(envelope, () => true);
    }
    const target = await saved;
    written.push(target);
    return target;
}
async function makeFile(bytes) {
    const dir = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), 'phonelink-test-'));
    const filePath = node_path_1.default.join(dir, 'payload.bin');
    const data = node_crypto_1.default.randomBytes(bytes);
    await promises_1.default.writeFile(filePath, data);
    return { filePath, digest: node_crypto_1.default.createHash('sha256').update(data).digest('hex') };
}
async function digestOf(filePath) {
    return node_crypto_1.default.createHash('sha256').update(await promises_1.default.readFile(filePath)).digest('hex');
}
(0, node_test_1.describe)('file transfer', () => {
    (0, node_test_1.it)('round-trips a multi-chunk file byte for byte', async () => {
        // Deliberately not a chunk multiple, so the final short chunk is exercised.
        const { filePath, digest } = await makeFile(200_000);
        const envelopes = await capture(filePath);
        strict_1.default.ok(envelopes.length > 3, 'should produce several chunks');
        strict_1.default.equal(envelopes[0]?.type, 'file_offer');
        strict_1.default.equal(envelopes.at(-1)?.type, 'file_complete');
        const saved = await receive(envelopes);
        strict_1.default.equal(await digestOf(saved), digest);
    });
    (0, node_test_1.it)('reassembles correctly when chunks arrive out of order', async () => {
        const { filePath, digest } = await makeFile(200_000);
        const envelopes = await capture(filePath);
        const offer = envelopes[0];
        const complete = envelopes.at(-1);
        const chunks = envelopes.slice(1, -1).reverse();
        strict_1.default.equal(await digestOf(await receive([offer, ...chunks, complete])), digest);
    });
    (0, node_test_1.it)('is unharmed by duplicated chunks', async () => {
        const { filePath, digest } = await makeFile(150_000);
        const envelopes = await capture(filePath);
        const offer = envelopes[0];
        const complete = envelopes.at(-1);
        const chunks = envelopes.slice(1, -1);
        const duplicated = [offer, ...chunks, ...chunks, complete];
        strict_1.default.equal(await digestOf(await receive(duplicated)), digest);
    });
    (0, node_test_1.it)('ignores chunks for a transfer that was never offered', async () => {
        const receiver = new fileTransfer_1.FileTransfers();
        let errored = false;
        receiver.on('error', () => {
            errored = true;
        });
        await receiver.handle({ type: 'file_chunk', fileId: 'ghost', chunkIndex: 0, totalChunks: 1, data: 'AAAA' }, () => true);
        await receiver.handle({ type: 'file_complete', fileId: 'ghost' }, () => true);
        strict_1.default.equal(errored, false);
    });
    (0, node_test_1.it)('leaves no temp file behind when a transfer is aborted', async () => {
        const { filePath } = await makeFile(150_000);
        const envelopes = await capture(filePath);
        const receiver = new fileTransfer_1.FileTransfers();
        await receiver.handle(envelopes[0], () => true);
        await receiver.handle(envelopes[1], () => true);
        await receiver.abortAll();
        const tempDir = node_path_1.default.join(node_os_1.default.tmpdir(), 'phonelink-transfers');
        const leftovers = await promises_1.default.readdir(tempDir).catch(() => []);
        strict_1.default.equal(leftovers.length, 0, `temp files left behind: ${leftovers.join(', ')}`);
    });
    (0, node_test_1.it)('never overwrites an existing download', async () => {
        const { filePath, digest } = await makeFile(80_000);
        const envelopes = await capture(filePath);
        const first = await receive(envelopes);
        const second = await receive(await capture(filePath));
        strict_1.default.notEqual(first, second);
        strict_1.default.equal(await digestOf(second), digest);
        // Earlier tests may already hold the plain name, so assert on the shape of the suffix.
        strict_1.default.match(node_path_1.default.basename(second), /\(\d+\)\.bin$/);
        strict_1.default.equal(await digestOf(first), digest, 'the first file must be untouched');
    });
});
