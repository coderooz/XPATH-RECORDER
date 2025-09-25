// background.js - service worker (improved)
// Maintains recording state and handles screenshot requests + badge updates.

const RECORDING_KEY = "xr_recording";
const RECORDS_KEY = "xr_records";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([RECORDING_KEY, RECORDS_KEY], (res) => {
    if (typeof res[RECORDING_KEY] === "undefined") {
      chrome.storage.local.set({ [RECORDING_KEY]: false });
      updateBadge(false);
    } else {
      updateBadge(res[RECORDING_KEY]);
    }
    if (typeof res[RECORDS_KEY] === "undefined") {
      chrome.storage.local.set({ [RECORDS_KEY]: [] });
    }
  });
});

function updateBadge(isRecording) {
  if (isRecording) {
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#E53935" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "setRecording") {
    const isRecording = !!message.recording;
    chrome.storage.local.set({ [RECORDING_KEY]: isRecording }, () => {
      updateBadge(isRecording);
      sendResponse({ success: true });
    });
    return true;
  }

  if (message?.action === "getRecords") {
    chrome.storage.local.get(RECORDS_KEY, (res) => {
      sendResponse({ success: true, records: res[RECORDS_KEY] || [] });
    });
    return true;
  }

  if (message?.action === "clearRecords") {
    chrome.storage.local.set({ [RECORDS_KEY]: [] }, () => sendResponse({ success: true }));
    return true;
  }

  if (message?.action === "captureViewport") {
    // Called from content script. message.meta should contain xpath, rect, url
    const meta = message.meta || {};
    chrome.storage.local.get(RECORDING_KEY, (res) => {
      if (!res[RECORDING_KEY]) {
        sendResponse({ success: false, error: "Not recording" });
        return;
      }
      // Capture visible tab in the sender's window and send screenshot back to the sender tab
      // Determine sender.tab
      const senderTabId = sender?.tab?.id;
      chrome.windows.getCurrent((win) => {
        chrome.tabs.captureVisibleTab(win.id, { format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Capture failed" });
            return;
          }
          // Send screenshot back to the tab that requested it
          if (typeof senderTabId === "number") {
            chrome.tabs.sendMessage(senderTabId, { action: "screenshot", screenshot: dataUrl, meta }, () => {
              // ignore errors
            });
          }
          sendResponse({ success: true });
        });
      });
    });
    return true;
  }

  // default
});
