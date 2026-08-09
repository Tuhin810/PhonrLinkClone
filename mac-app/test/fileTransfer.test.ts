import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { Envelope } from '@phonelink/shared';
import { FileTransfers } from '../src/main/fileTransfer';

const downloads = path.join(os.homedir(), 'Downloads', 'PhoneLinkClone');
const written: string[] = [];

after(async () => {
  for (const file of written) await fsp.rm(file, { force: true });
});

/** Captures the envelopes a send produces, without a socket. */
async function capture(filePath: string): Promise<Envelope[]> {
  const sender = new FileTransfers();
  const envelopes: Envelope[] = [];
  await sender.send(
    filePath,
    envelope => {
      envelopes.push(envelope);
      return true;
    },
    () => true,
  );
  return envelopes;
}

/** Feeds envelopes into a receiver and resolves with the saved path. */
async function receive(envelopes: Envelope[]): Promise<string> {
  const receiver = new FileTransfers();
  const saved = new Promise<string>((resolve, reject) => {
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

async function makeFile(bytes: number): Promise<{ filePath: string; digest: string }> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'phonelink-test-'));
  const filePath = path.join(dir, 'payload.bin');
  const data = crypto.randomBytes(bytes);
  await fsp.writeFile(filePath, data);
  return { filePath, digest: crypto.createHash('sha256').update(data).digest('hex') };
}

async function digestOf(filePath: string): Promise<string> {
  return crypto.createHash('sha256').update(await fsp.readFile(filePath)).digest('hex');
}

describe('file transfer', () => {
  it('round-trips a multi-chunk file byte for byte', async () => {
    // Deliberately not a chunk multiple, so the final short chunk is exercised.
    const { filePath, digest } = await makeFile(200_000);
    const envelopes = await capture(filePath);
    assert.ok(envelopes.length > 3, 'should produce several chunks');
    assert.equal(envelopes[0]?.type, 'file_offer');
    assert.equal(envelopes.at(-1)?.type, 'file_complete');

    const saved = await receive(envelopes);
    assert.equal(await digestOf(saved), digest);
  });

  it('reassembles correctly when chunks arrive out of order', async () => {
    const { filePath, digest } = await makeFile(200_000);
    const envelopes = await capture(filePath);
    const offer = envelopes[0]!;
    const complete = envelopes.at(-1)!;
    const chunks = envelopes.slice(1, -1).reverse();

    assert.equal(await digestOf(await receive([offer, ...chunks, complete])), digest);
  });

  it('is unharmed by duplicated chunks', async () => {
    const { filePath, digest } = await makeFile(150_000);
    const envelopes = await capture(filePath);
    const offer = envelopes[0]!;
    const complete = envelopes.at(-1)!;
    const chunks = envelopes.slice(1, -1);

    const duplicated = [offer, ...chunks, ...chunks, complete];
    assert.equal(await digestOf(await receive(duplicated)), digest);
  });

  it('ignores chunks for a transfer that was never offered', async () => {
    const receiver = new FileTransfers();
    let errored = false;
    receiver.on('error', () => {
      errored = true;
    });
    await receiver.handle(
      { type: 'file_chunk', fileId: 'ghost', chunkIndex: 0, totalChunks: 1, data: 'AAAA' },
      () => true,
    );
    await receiver.handle({ type: 'file_complete', fileId: 'ghost' }, () => true);
    assert.equal(errored, false);
  });

  it('leaves no temp file behind when a transfer is aborted', async () => {
    const { filePath } = await makeFile(150_000);
    const envelopes = await capture(filePath);
    const receiver = new FileTransfers();
    await receiver.handle(envelopes[0]!, () => true);
    await receiver.handle(envelopes[1]!, () => true);
    await receiver.abortAll();

    const tempDir = path.join(os.tmpdir(), 'phonelink-transfers');
    const leftovers = await fsp.readdir(tempDir).catch(() => []);
    assert.equal(leftovers.length, 0, `temp files left behind: ${leftovers.join(', ')}`);
  });

  it('never overwrites an existing download', async () => {
    const { filePath, digest } = await makeFile(80_000);
    const envelopes = await capture(filePath);
    const first = await receive(envelopes);
    const second = await receive(await capture(filePath));

    assert.notEqual(first, second);
    assert.equal(await digestOf(second), digest);
    // Earlier tests may already hold the plain name, so assert on the shape of the suffix.
    assert.match(path.basename(second), /\(\d+\)\.bin$/);
    assert.equal(await digestOf(first), digest, 'the first file must be untouched');
  });
});
