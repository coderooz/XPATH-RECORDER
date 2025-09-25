// content.js - injected on all pages
// Captures clicks, computes XPath & bounding rect, requests screenshot, crops or outlines, stores record.

(function () {
  const RECORDING_KEY = "xr_recording";
  const RECORDS_KEY = "xr_records";
  const CROPPING_PREF_KEY = "xr_cropping_enabled";

  // Default cropping preference (true = crop element only)
  chrome.storage.local.get(CROPPING_PREF_KEY, (res) => {
    if (typeof res[CROPPING_PREF_KEY] === "undefined") {
      chrome.storage.local.set({ [CROPPING_PREF_KEY]: true });
    }
  });

  // Helper: compute unique-ish XPath for an element
  function getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    const parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = element.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      const tagName = element.nodeName.toLowerCase();
      const part = `${tagName}[${index}]`;
      parts.unshift(part);
      element = element.parentNode;
    }
    return "/" + parts.join("/");
  }

  // Add highlight overlay for quick feedback
  function flashHighlight(rect) {
    try {
      const overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      overlay.style.background = "rgba(229,57,53,0.12)";
      overlay.style.border = "2px solid rgba(229,57,53,0.9)";
      overlay.style.zIndex = 2147483647;
      overlay.style.pointerEvents = "none";
      overlay.style.transition = "opacity .5s ease-out, transform .4s ease-out";
      overlay.style.borderRadius = "4px";
      document.documentElement.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.transform = "scale(1)";
      });
      setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 500);
      }, 500);
    } catch (e) {
      // ignore
    }
  }

  // Crop or annotate the screenshot inside the page (we receive screenshot from background)
  function processScreenshotAndSave(dataUrl, itemMeta) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const dpr = window.devicePixelRatio || 1;
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Determine whether cropping is enabled
          chrome.storage.local.get(CROPPING_PREF_KEY, (res) => {
            const croppingEnabled = res[CROPPING_PREF_KEY] !== false; // default true
            if (croppingEnabled) {
              // crop to element bounding rect (account for DPR)
              const sx = Math.max(0, Math.floor(itemMeta.rect.left * dpr));
              const sy = Math.max(0, Math.floor(itemMeta.rect.top * dpr));
              const sw = Math.max(1, Math.floor(itemMeta.rect.width * dpr));
              const sh = Math.max(1, Math.floor(itemMeta.rect.height * dpr));
              canvas.width = sw;
              canvas.height = sh;
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            } else {
              // full viewport with red outline
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              // draw outline rectangle (scaled)
              const left = Math.floor(itemMeta.rect.left * dpr);
              const top = Math.floor(itemMeta.rect.top * dpr);
              const width = Math.floor(itemMeta.rect.width * dpr);
              const height = Math.floor(itemMeta.rect.height * dpr);
              ctx.lineWidth = Math.max(2, Math.floor(3 * dpr));
              ctx.strokeStyle = "rgba(229,57,53,1)";
              ctx.setLineDash([4 * dpr, 3 * dpr]);
              ctx.strokeRect(left + 1, top + 1, width - 2, height - 2);
            }

            const finalDataUrl = canvas.toDataURL("image/png");
            // Save record in chrome.storage.local
            chrome.storage.local.get(RECORDS_KEY, (res2) => {
              const arr = Array.isArray(res2[RECORDS_KEY]) ? res2[RECORDS_KEY] : [];
              const record = {
                id: `xr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                xpath: itemMeta.xpath,
                url: itemMeta.url,
                timestamp: new Date().toISOString(),
                rect: itemMeta.rect,
                screenshot: finalDataUrl
              };
              arr.push(record);
              chrome.storage.local.set({ [RECORDS_KEY]: arr }, () => {
                resolve(record);
              });
            });
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  }

  // When background returns screenshot, it will call sendMessage to this tab with action 'screenshotReady'
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === "screenshotReady" && message.payload) {
      const itemMeta = message.payload.meta;
      const screenshot = message.payload.screenshot;
      processScreenshotAndSave(screenshot, itemMeta).then((record) => {
        // flash highlight on page
        flashHighlight(itemMeta.rect);
        // notify popup via storage change (popup listens for storage or polling)
        // we also post a transient message for immediate UI updates if needed
        chrome.runtime.sendMessage({ action: "recordSaved", recordId: record.id });
      }).catch((err) => {
        console.error("Failed to process screenshot:", err);
      });
      return;
    }

    return;
  });

  // Click handler
  function handleClick(ev) {
    try {
      // left click only (button === 0)
      if (ev.button !== 0) return;
      const el = ev.target;
      if (!(el instanceof Element)) return;

      // get bounding rect
      const rect = el.getBoundingClientRect();
      const absoluteRect = {
        left: rect.left + (window.scrollX || window.pageXOffset),
        top: rect.top + (window.scrollY || window.pageYOffset),
        width: rect.width,
        height: rect.height
      };

      const xpath = getXPath(el);
      const pageUrl = location.href;

      // Only proceed if recording is active
      chrome.storage.local.get(RECORDING_KEY, (res) => {
        if (!res[RECORDING_KEY]) return;
        // Request screenshot from background (service worker)
        chrome.runtime.sendMessage({ action: "captureViewport" }, (resp) => {
          // chrome.runtime.sendMessage gets response from background (we handle async there)
          // But background returns via sendResponse and we set return true - here response might be undefined in some cases.
          // Instead background will call chrome.tabs.sendMessage with the screenshot to this tab.
        });

        // Prepare meta to be used when screenshot comes back
        // Save the meta temporarily in a map keyed by a timestamp-ish id
        // We'll include the meta in background->content message in a second (background captures and then sends screenshot back)
        // To make sure background knows which tab to respond to, it uses chrome.tabs.captureVisibleTab() and then chrome.tabs.sendMessage to this tab.
        // We ask background to capture and, separately, it will send screenshot back and we process it.
        // Send a small ping so background can know meta; we'll store meta temporarily in chrome.storage.session-like key
        const meta = {
          xpath,
          rect: absoluteRect,
          url: pageUrl
        };
        // attach meta for next step: we set a temporary local storage key used by background to pass along
        // We'll store it under a per-tab key so background can retrieve. Use a simple approach — use chrome.tabs.getCurrent is not available in content script
        // So instead include meta inside a followup message: the background will call chrome.tabs.sendMessage with the screenshot and include meta in payload.
        // To enable that, include meta when we call capture; we send a message to background to instruct it to capture and include meta.
        chrome.runtime.sendMessage({ action: "captureViewportWithMeta", meta }, (r) => {
          // if background doesn't handle captureViewportWithMeta, fallback: background listens only for captureViewport; but we implement captureViewportWithMeta below by listening in background via message.
        });

      });
    } catch (err) {
      console.error("click handler error", err);
    }
  }

  // Improved click listener: we send a combined message that background handles
  document.addEventListener("click", (ev) => {
    try {
      const el = ev.target;
      if (!(el instanceof Element)) return;
      // compute data
      const rect = el.getBoundingClientRect();
      const absoluteRect = {
        left: rect.left + (window.scrollX || window.pageXOffset),
        top: rect.top + (window.scrollY || window.pageYOffset),
        width: rect.width,
        height: rect.height
      };
      const xpath = getXPath(el);
      const pageUrl = location.href;

      // Ask background to check recording + capture screenshot and send back with meta
      chrome.runtime.sendMessage({ action: "captureViewport", meta: { xpath, rect: absoluteRect, url: pageUrl } }, (resp) => {
        // background handles sending screenshot back via chrome.tabs.sendMessage
      });
    } catch (e) {
      console.error(e);
    }
  }, true); // capture phase to reliably catch clicks before page handlers

  // Background will call chrome.tabs.sendMessage with action 'screenshot' and payload { screenshot, meta }
  // We'll listen for that variant:
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === "screenshot") {
      const screenshot = message.screenshot;
      const meta = message.meta;
      if (!screenshot || !meta) return;
      processScreenshotAndSave(screenshot, meta).then((record) => {
        flashHighlight(meta.rect);
        chrome.runtime.sendMessage({ action: "recordSaved", recordId: record.id });
      }).catch((err) => {
        console.error("processScreenshotAndSave error", err);
      });
    }
  });
})();
