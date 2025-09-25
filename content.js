// content.js

// Get XPath of element
function getXPath(element) {
  if (!element) return null;
  if (element.id) return `//*[@id="${element.id}"]`;
  if (element === document.body) return "/html/body";

  const parts = [];
  while (element && element.nodeType === 1) {
    let nb = 0;
    let sib = element.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && sib.nodeName === element.nodeName) nb++;
      sib = sib.previousSibling;
    }
    const idx = nb ? `[${nb + 1}]` : "";
    parts.unshift(element.nodeName.toLowerCase() + idx);
    element = element.parentNode;
  }
  return "/" + parts.join("/");
}

// CSS path generator
function getCssPath(el) {
  if (!(el instanceof Element)) return null;
  const path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += "#" + el.id;
      path.unshift(selector);
      break;
    } else {
      let sibling = el, nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.nodeName.toLowerCase() === el.nodeName.toLowerCase()) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

// On click capture
document.addEventListener("click", (event) => {
  // Allow modifier key to force-ignore recording (optional)
  // event.ctrlKey etc.

  // Determine if recording is enabled
  chrome.storage.sync.get(["recordingEnabled"], (data) => {
    if (!data.recordingEnabled) return;

    event.preventDefault();
    event.stopPropagation();

    const el = event.target;
    const xpath = getXPath(el);
    const cssPath = getCssPath(el);
    const rect = el.getBoundingClientRect();
    // Convert to page coordinates (so screenshot cropping aligns with page scroll)
    const pageRect = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height
    };

    // include devicePixelRatio to scale cropping properly in background
    const dpr = window.devicePixelRatio || 1;

    chrome.runtime.sendMessage({
      type: "capture",
      data: {
        url: location.href,
        title: document.title,
        xpath,
        cssPath,
        rect: pageRect,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        dpr,
        timestamp: Date.now()
      }
    }, (response) => {
      // optional callback if needed
    });
  });
}, true);
