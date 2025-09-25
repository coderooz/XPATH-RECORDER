chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "capture") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (imgUrl) => {
      sendResponse({ imgUrl, data: msg.data });
    });
    return true; // keep channel open for async response
  }
});
