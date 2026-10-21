import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ClipboardHistory, HISTORY_LIMIT } from '../src/main/clipboardHistory';

describe('clipboard history', () => {
  it('lists newest first and remembers where each clip came from', () => {
    const history = new ClipboardHistory();
    history.add('first', 'mac', 1);
    history.add('second', 'phone', 2);
    assert.deepEqual(
      history.list().map(entry => [entry.text, entry.source]),
      [
        ['second', 'phone'],
        ['first', 'mac'],
      ],
    );
  });

  it('moves a repeated clip to the top instead of duplicating it', () => {
    const history = new ClipboardHistory();
    history.add('a', 'mac');
    history.add('b', 'mac');
    history.add('a', 'phone');
    assert.deepEqual(
      history.list().map(entry => entry.text),
      ['a', 'b'],
    );
    assert.equal(history.list()[0]?.source, 'phone');
  });

  it('drops the oldest clips past the limit', () => {
    const history = new ClipboardHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history.add(`clip ${i}`, 'mac');
    const texts = history.list().map(entry => entry.text);
    assert.equal(texts.length, HISTORY_LIMIT);
    assert.equal(texts[0], `clip ${HISTORY_LIMIT + 4}`);
    assert.ok(!texts.includes('clip 0'));
  });

  it('removes one clip by id, and clears all', () => {
    const history = new ClipboardHistory();
    const keep = history.add('keep', 'mac');
    const drop = history.add('drop', 'mac');
    assert.equal(history.remove(drop.id), true);
    assert.equal(history.remove(drop.id), false);
    assert.equal(history.get(keep.id)?.text, 'keep');
    history.clear();
    assert.deepEqual(history.list(), []);
  });
});
