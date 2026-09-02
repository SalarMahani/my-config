// Shared helpers for the content-script side.
//
// All files in one content_scripts entry run in the same isolated world and share
// top-level scope, so bookmarks.js and activity.js pick SP up from here -- the same
// arrangement Vimium uses for its own twenty content script files.
//
// The page (file://) and this script are separate JS worlds sharing one document.
// window.postMessage is the channel between them; it structured-clones properly in
// both directions, which CustomEvent detail does not reliably do.

var SP = {
  send(type, extra) {
    return chrome.runtime.sendMessage(Object.assign({ type }, extra));
  },

  // Requires the "favicon" permission plus _favicon/* in web_accessible_resources,
  // matched to file:///* so this page is allowed to load them.
  faviconUrl(pageUrl, size) {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl);
    u.searchParams.set("size", String(size || 32));
    return u.toString();
  },

  el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  },

  // host + path, with the noise stripped -- what to show when a bookmark has no
  // usable title of its own.
  prettyUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "") +
             (u.pathname + u.search).replace(/\/$/, "");
    } catch {
      return url || "";
    }
  },

  // A link with a favicon and a letter-tile fallback.
  link(url, title) {
    // 33 of the bookmarks here have whitespace-only titles -- the usual trick for
    // making the Chrome bookmarks bar show favicons and nothing else. Trim before
    // testing, or those render as invisible rows.
    const label = (title || "").trim() || SP.prettyUrl(url);

    const fallback = SP.el("span", {
      class: "sp-favicon sp-favicon-fallback",
      text: label.charAt(0).toUpperCase() || "?",
    });
    const icon = SP.el("img", { class: "sp-favicon", src: SP.faviconUrl(url), alt: "" });
    icon.addEventListener("error", () => icon.replaceWith(fallback));

    return SP.el("a", { class: "sp-link", href: url, title: url }, [
      icon,
      SP.el("span", { class: "sp-link-title", text: label }),
    ]);
  },

  fail(mount, err) {
    mount.textContent = "";
    mount.appendChild(SP.el("p", {
      class: "sp-error",
      text: "Could not load: " + ((err && err.message) || err),
    }));
  },

  whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  },
};

/* ------------------------------------------------ page <-> extension bridging */

// Hand the page its stored state as early as possible, so the wallpaper does not
// visibly change after first paint.
// Only keys the PAGE needs belong here -- the page has no chrome.* APIs, so this is
// its only route to stored state. Content scripts (bookmarks.js, activity.js) reach
// chrome.storage directly and must not be routed through this.
chrome.storage.local.get(["wallpaperIndex", "zenMode"]).then((state) => {
  window.postMessage({ __sp: "state", state }, "*");
});

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.__sp !== "save" || typeof d.key !== "string") return;
  chrome.storage.local.set({ [d.key]: d.value });
});
