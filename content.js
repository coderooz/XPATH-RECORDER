// Utility: get XPath of an element
function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  if (element === document.body) {
    return "/html/body";
  }

  let ix = 0;
  let siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
    let sibling = siblings[i];
    if (sibling.nodeType === 1 && sibling.nodeName === element.nodeName) {
      ix++;
      if (sibling === element) {
        return getXPath(element.parentNode) + "/" + element.nodeName.toLowerCase() + "[" + ix + "]";
      }
    }
  }
}

// Utility: get unique CSS path
function getCssPath(el) {
  if (!(el instanceof Element)) return;
  var path = [];
  while (el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += "#" + el.id;
      path.unshift(selector);
      break;
    } else {
      let sib = el, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    el = el.parentNode;
  }
  return path.join(" > ");
}

// Capture element on click
document.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();

  let el = event.target;
  let xpath = getXPath(el);
  let cssPath = getCssPath(el);
  let rect = el.getBoundingClientRect();

  // Ask background to take screenshot
  chrome.runtime.sendMessage({
    type: "capture",
    data: { xpath, cssPath, rect }
  });
});
