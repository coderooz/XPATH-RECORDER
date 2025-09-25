// background.js

// Helper: append recording to storage
async function saveRecording(recording) {
  return new Promise((res) => {
    chrome.storage.local.get(["recordings"], (obj) => {
      const arr = obj.recordings || [];
      arr.push(recording);
      chrome.storage.local.set({ recordings: arr }, () => res());
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "capture") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("capture error:", chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      const { rect, dpr, xpath, cssPath, url, title, timestamp } = msg.data;

      // If cropping disabled -> return full screenshot with a border overlay added on page
      chrome.storage.sync.get(["cropEnabled"], async (settings) => {
        const crop = (settings.cropEnabled === undefined) ? true : settings.cropEnabled;

        if (!crop) {
          // Show red border on page for 1.5s then remove
          chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (r) => {
              const div = document.createElement('div');
              div.style.position = 'absolute';
              div.style.top = (r.top - window.scrollY) + 'px';
              div.style.left = (r.left - window.scrollX) + 'px';
              div.style.width = r.width + 'px';
              div.style.height = r.height + 'px';
              div.style.border = '3px solid rgba(255,0,0,0.9)';
              div.style.zIndex = 2147483647;
              div.style.pointerEvents = 'none';
              div.style.boxSizing = 'border-box';
              document.documentElement.appendChild(div);
              setTimeout(() => div.remove(), 1600);
            },
            args: [rect]
          });

          // Save full image and metadata
          const recording = {
            xpath,
            cssPath,
            url,
            title,
            timestamp,
            image: dataUrl,
            crop: false,
            rect
          };
          await saveRecording(recording);
          chrome.runtime.sendMessage({ type: "newRecording" });
          sendResponse({ success: true });
          return;
        }

        // Crop according to rect (rect are page coords, dataUrl corresponds to visible viewport at capture time)
        // We need to compute cropping parameters in the captured image:
        // captureVisibleTab captures the visible viewport. Use sender.tab to find scroll offsets? Simpler:
        // We'll compute the offset: top of pageRect relative to viewport at capture time:
        // We'll send rect and viewport via content script in the future for more exact handling.
        // For now, assume the captured visible area corresponds to the viewport at time of capture — we need the page scroll to compute where rect sits inside the captured image.
        // To get scroll offsets at capture time, include them from content script or compute using rect and viewport info sent.
        const { viewport } = msg.data || {};
        // rect.top is page Y; captured image corresponds to viewport top at scrollY at capture time.
        // So the top offset in the image = rect.top - scrollYAtCapture. We don't currently have scrollYAtCapture, but we can derive:
        // For accuracy, content script should send scrollY at capture time. Let's assume pageRect.top equals rect.top (page coords) and the capture corresponds to current viewport with scrollY s.t. visible top = current scrollY.
        // To avoid mismatch, content script sends rect relative to page and also viewport; background will attempt to find scrollY by injecting a script to get current scroll position at capture time.
        // Instead: ask content script to include scrollY and scrollX in message. (We will modify content.js to include scrollX/Y)

        // However to keep this file working, we will parse and attempt cropping using rect and dpr by mapping to image coords:
        const img = new Image();
        img.onload = async () => {
          try {
            // calculate top-left in image coordinates:
            // Need scroll offsets at capture time. We'll attempt to get them by executing script to fetch scroll position:
            chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              func: () => ({ scrollX: window.scrollX, scrollY: window.scrollY, dpr: window.devicePixelRatio || 1 })
            }, async (frames) => {
              const sc = frames && frames[0] && frames[0].result ? frames[0].result : { scrollX:0, scrollY:0, dpr:1 };
              const scrollX = sc.scrollX;
              const scrollY = sc.scrollY;
              const pageDpr = sc.dpr;

              // compute source crop in image pixels
              const sx = Math.round((rect.left - scrollX) * dpr);
              const sy = Math.round((rect.top - scrollY) * dpr);
              const sw = Math.round(rect.width * dpr);
              const sh = Math.round(rect.height * dpr);

              // clamp values
              const sxx = Math.max(0, Math.min(sx, img.width - 1));
              const syy = Math.max(0, Math.min(sy, img.height - 1));
              const sww = Math.max(1, Math.min(sw, img.width - sxx));
              const shh = Math.max(1, Math.min(sh, img.height - syy));

              const canvas = new OffscreenCanvas(sww, shh);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, sxx, syy, sww, shh, 0, 0, sww, shh);
              const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
              const reader = new FileReader();
              reader.onload = async () => {
                const croppedDataUrl = reader.result;
                const recording = {
                  xpath,
                  cssPath,
                  url,
                  title,
                  timestamp,
                  image: croppedDataUrl,
                  crop: true,
                  rect
                };
                await saveRecording(recording);
                chrome.runtime.sendMessage({ type: "newRecording" });
                sendResponse({ success: true });
              };
              reader.readAsDataURL(croppedBlob);
            });
          } catch (err) {
            console.error('crop error', err);
            // fallback: save full image
            const recording = {
              xpath,
              cssPath,
              url,
              title,
              timestamp,
              image: dataUrl,
              crop: true,
              rect
            };
            await saveRecording(recording);
            chrome.runtime.sendMessage({ type: "newRecording" });
            sendResponse({ success: true });
          }
        };
        img.src = dataUrl;
      });
    });

    // Keep channel open for async response
    return true;
  }

  // Popup asks for recordings
  if (msg.type === "getRecordings") {
    chrome.storage.local.get(["recordings"], (obj) => {
      sendResponse({ recordings: obj.recordings || [] });
    });
    return true;
  }

  if (msg.type === "clearRecordings") {
    chrome.storage.local.set({ recordings: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});


// background.js
function setRecordingBadge(isRecording) {
  if (isRecording) {
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#e11d48" }); // red
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}
