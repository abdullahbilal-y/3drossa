import { Journey } from "../core/index.js";

/**
 * The draft, kept in the browser.
 *
 * Every read validates by CONSTRUCTING a journey from what came back, and
 * throws the draft away if it does not parse. Storage outlives the code that
 * wrote it: a document saved by an older version of the format, or by a
 * different site sharing the key, would otherwise be restored straight into the
 * editor and crash it on mount — with no obvious way for the person in front of
 * it to get back to a working page, because the bad value is reloaded every
 * time they refresh. Dropping it silently is the only recovery they can reach.
 *
 * Every entry point is guarded: a private window, disabled site data, or a full
 * quota all throw on plain property access, and none of them are a reason for
 * the editor not to open.
 */

export function loadStored(key) {
  if (!key || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const doc = JSON.parse(raw);
    new Journey(doc);
    return doc;
  } catch {
    clearStored(key);
    return null;
  }
}

export function storeDoc(key, doc) {
  if (!key || typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    // Out of quota, or site data is off. The editor keeps working; it just
    // stops promising the draft will still be there tomorrow.
    return false;
  }
}

export function clearStored(key) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do, and nothing worth interrupting an edit over.
  }
}
