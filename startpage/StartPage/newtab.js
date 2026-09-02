// The new tab stub.
//
// Its only job is to hand the tab over to the real page, which lives on file://.
// That location is deliberate: Chrome's content-script match patterns only accept
// http, https and file -- never chrome-extension:// -- so a page served from the
// extension origin would be unreachable to Vimium. Keeping the panel on file://
// is what lets Vimium keep working on it, and the content script in this same
// extension is what carries bookmark and history data across.
//
// Note the redirect goes through chrome.tabs.update rather than location.replace:
// Chrome blocks scripted navigation from an extension page to a file:// URL.

const TARGET = "file:///home/albos/StartPage/index.html";

function showWarning() {
  document.getElementById("warn").style.display = "block";
  document.getElementById("ext-link").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.update({ url: "chrome://extensions/?id=" + chrome.runtime.id });
  });
}

chrome.extension.isAllowedFileSchemeAccess((allowed) => {
  if (!allowed) {
    showWarning();
    return;
  }
  chrome.tabs.getCurrent((tab) => {
    if (tab) {
      chrome.tabs.update(tab.id, { url: TARGET });
    } else {
      showWarning();
    }
  });
});
