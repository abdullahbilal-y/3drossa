import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { loadStored, storeDoc, clearStored } from "../src/editor/storage.js";

/**
 * The draft kept in the browser.
 *
 * Testable here because storage.js touches exactly one global. The property
 * that matters is not "it round-trips" — it is that a draft written by an
 * OLDER version of the format still opens, because storage outlives the code
 * that wrote it and a stale draft is reloaded on every refresh. Someone whose
 * draft crashes the editor has no way back to a working page.
 */

const KEY = "3drossa:test";

/** The smallest document that parses. */
const MINIMAL = {
  version: 1,
  path: [
    { p: 0, sx: 0.5, y: 0, z: -1 },
    { p: 1, sx: -0.5, y: 0, z: -2 },
  ],
};

globalThis.window = {
  localStorage: {
    store: new Map(),
    getItem(k) {
      return this.store.has(k) ? this.store.get(k) : null;
    },
    setItem(k, v) {
      this.store.set(k, String(v));
    },
    removeItem(k) {
      this.store.delete(k);
    },
  },
};

afterEach(() => window.localStorage.store.clear());

describe("draft storage", () => {
  test("a draft written before a field existed still opens", () => {
    // Exactly the shape a 0.1.x editor would have saved: no subject block, no
    // camera path. It is valid, and it must come back complete.
    window.localStorage.setItem(KEY, JSON.stringify(MINIMAL));

    const doc = loadStored(KEY);

    assert.ok(doc, "the draft was thrown away");
    assert.ok(doc.subject, "subject is missing — the panel reads doc.subject.heading");
    assert.equal(doc.subject.heading, true);
    assert.deepEqual(doc.subject.rotation, [0, 0, 0]);
    assert.deepEqual(doc.cameraPath, [], "cameraPath is missing — the editor reads .length");
    assert.ok(doc.camera, "camera is missing");
  });

  test("a draft that does not parse is dropped, not returned", () => {
    // Otherwise it is restored on every refresh and there is no way back to a
    // working page from inside the browser.
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, path: [] }));

    assert.equal(loadStored(KEY), null);
    assert.equal(window.localStorage.getItem(KEY), null, "the bad draft was left behind");
  });

  test("nonsense in the slot is dropped too", () => {
    window.localStorage.setItem(KEY, "{not json");
    assert.equal(loadStored(KEY), null);
    assert.equal(window.localStorage.getItem(KEY), null);
  });

  test("no key means no storage at all", () => {
    assert.equal(loadStored(null), null);
    assert.equal(storeDoc(null, MINIMAL), false);
    clearStored(null);
  });

  test("a stored draft round-trips", () => {
    assert.equal(storeDoc(KEY, MINIMAL), true);
    const doc = loadStored(KEY);
    assert.equal(doc.path.length, 2);

    clearStored(KEY);
    assert.equal(loadStored(KEY), null);
  });
});
