// Page-side persistence.
//
// This page runs on file:// and has no chrome.* APIs, so durable state goes out
// through the content script: postMessage here, chrome.storage.local there.
//
// localStorage is only a synchronous *fast path*, used so a remembered setting can
// be applied before the content script's async read comes back. It may be
// unavailable depending on how Chrome was launched, so every access is guarded and
// the extension side remains the real store.

globalThis.SPState = (function () {
  "use strict";

  const listeners = [];
  let remote = null; // the last state the extension sent us

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    window.postMessage({ __sp: "save", key, value }, "*");
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__sp !== "state") return;
    remote = d.state || {};
    for (const fn of listeners) fn(remote);
  });

  return {
    read,
    write,

    // Called when the extension reports stored state. Fires immediately if it has
    // already arrived, so registration order does not matter.
    onRemote(fn) {
      listeners.push(fn);
      if (remote) fn(remote);
    },

    // Shared guard: ignore a hotkey while the user is typing.
    isTyping(target) {
      return Boolean(target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ));
    },
  };
})();
