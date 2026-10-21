"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const clipboardHistory_1 = require("../src/main/clipboardHistory");
(0, node_test_1.describe)('clipboard history', () => {
    (0, node_test_1.it)('lists newest first and remembers where each clip came from', () => {
        const history = new clipboardHistory_1.ClipboardHistory();
        history.add('first', 'mac', 1);
        history.add('second', 'phone', 2);
        strict_1.default.deepEqual(history.list().map(entry => [entry.text, entry.source]), [
            ['second', 'phone'],
            ['first', 'mac'],
        ]);
    });
    (0, node_test_1.it)('moves a repeated clip to the top instead of duplicating it', () => {
        const history = new clipboardHistory_1.ClipboardHistory();
        history.add('a', 'mac');
        history.add('b', 'mac');
        history.add('a', 'phone');
        strict_1.default.deepEqual(history.list().map(entry => entry.text), ['a', 'b']);
        strict_1.default.equal(history.list()[0]?.source, 'phone');
    });
    (0, node_test_1.it)('drops the oldest clips past the limit', () => {
        const history = new clipboardHistory_1.ClipboardHistory();
        for (let i = 0; i < clipboardHistory_1.HISTORY_LIMIT + 5; i++)
            history.add(`clip ${i}`, 'mac');
        const texts = history.list().map(entry => entry.text);
        strict_1.default.equal(texts.length, clipboardHistory_1.HISTORY_LIMIT);
        strict_1.default.equal(texts[0], `clip ${clipboardHistory_1.HISTORY_LIMIT + 4}`);
        strict_1.default.ok(!texts.includes('clip 0'));
    });
    (0, node_test_1.it)('removes one clip by id, and clears all', () => {
        const history = new clipboardHistory_1.ClipboardHistory();
        const keep = history.add('keep', 'mac');
        const drop = history.add('drop', 'mac');
        strict_1.default.equal(history.remove(drop.id), true);
        strict_1.default.equal(history.remove(drop.id), false);
        strict_1.default.equal(history.get(keep.id)?.text, 'keep');
        history.clear();
        strict_1.default.deepEqual(history.list(), []);
    });
});
