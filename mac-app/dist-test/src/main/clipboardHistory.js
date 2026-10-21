"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipboardHistory = exports.HISTORY_LIMIT = void 0;
const node_crypto_1 = require("node:crypto");
/** Enough to scroll back through a session without the popup state growing unbounded. */
exports.HISTORY_LIMIT = 50;
/**
 * Recent clipboard texts from both devices, newest first.
 *
 * Memory only, by design: clipboards routinely hold passwords and one-time codes, so the
 * history never touches disk and is gone when the app quits.
 */
class ClipboardHistory {
    entries = [];
    /** Records a clip. Copying the same text again moves it to the top instead of duplicating. */
    add(text, source, timestamp = Date.now()) {
        this.entries = this.entries.filter(entry => entry.text !== text);
        const entry = { id: (0, node_crypto_1.randomUUID)(), text, source, timestamp };
        this.entries.unshift(entry);
        this.entries.length = Math.min(this.entries.length, exports.HISTORY_LIMIT);
        return entry;
    }
    get(id) {
        return this.entries.find(entry => entry.id === id);
    }
    remove(id) {
        const before = this.entries.length;
        this.entries = this.entries.filter(entry => entry.id !== id);
        return this.entries.length !== before;
    }
    clear() {
        this.entries = [];
    }
    list() {
        return [...this.entries];
    }
}
exports.ClipboardHistory = ClipboardHistory;
