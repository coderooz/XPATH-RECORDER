// popup.js - controls start/stop recording, shows status, handles downloads

const RECORDS_KEY = "xr_records";
const RECORDING_KEY = "xr_recording";
const CROPPING_PREF_KEY = "xr_cropping_enabled";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const countEl = document.getElementById("count");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const downloadJsonBtn = document.getElementById("downloadJson");
const downloadZipBtn = document.getElementById("downloadZip");
const clearBtn = document.getElementById("clearRecords");
const cropCheckbox = document.getElementById("cropCheckbox");
const toastEl = document.getElementById("toast");

function showToast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastEl.classList.add("show");
  setTimeout(() => {
    toastEl.classList.remove("show");
    setTimeout(() => toastEl.classList.add("hidden"), 220);
  }, ms);
}

function setRecordingUI(isRecording) {
  if (isRecording) {
    statusDot.classList.remove("gray");
    statusDot.classList.add("red");
    statusText.textContent = "Recording…";
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusDot.classList.remove("red");
    statusDot.classList.add("gray");
    statusText.textContent = "Not Recording";
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function updateCount() {
  chrome.storage.local.get(RECORDS_KEY, (res) => {
    const arr = Array.isArray(res[RECORDS_KEY]) ? res[RECORDS_KEY] : [];
    countEl.textContent = `Items: ${arr.length}`;
  });
}

function loadRecordingState() {
  chrome.storage.local.get(RECORDING_KEY, (res) => {
    setRecordingUI(!!res[RECORDING_KEY]);
  });
}

function setRecordingState(flag) {
  chrome.runtime.sendMessage({ action: "setRecording", recording: !!flag }, (resp) => {
    if (resp && resp.success) {
      setRecordingUI(!!flag);
      showToast(flag ? "Recording started" : "Recording stopped");
    }
  });
}

startBtn.addEventListener("click", () => {
  setRecordingState(true);
});

stopBtn.addEventListener("click", () => {
  setRecordingState(false);
});

downloadJsonBtn.addEventListener("click", async () => {
  chrome.storage.local.get(RECORDS_KEY, (res) => {
    const arr = Array.isArray(res[RECORDS_KEY]) ? res[RECORDS_KEY] : [];
    if (!arr.length) {
      showToast("No items to download");
      return;
    }

    // Optionally separate image data into separate files; for JSON include base64 if small
    const exportRecords = arr.map(({ screenshot, ...rest }) => rest);

    const jsonStr = JSON.stringify({ exportedAt: new Date().toISOString(), items: exportRecords }, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    saveAs(blob, `xpath-records-${Date.now()}.json`);
    showToast("JSON download started");
  });
});

downloadZipBtn.addEventListener("click", async () => {
  chrome.storage.local.get(RECORDS_KEY, async (res) => {
    const arr = Array.isArray(res[RECORDS_KEY]) ? res[RECORDS_KEY] : [];
    if (!arr.length) {
      showToast("No items to download");
      return;
    }

    showToast("Preparing ZIP…");
    const zip = new JSZip();
    const metadata = { exportedAt: new Date().toISOString(), items: [] };

    // Add images and build metadata
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      // screenshot is a dataURL like data:image/png;base64,....
      const dataUrl = item.screenshot;
      const base64 = dataUrl.split(",")[1];
      const filename = `screenshot-${i + 1}-${item.id}.png`;
      zip.file(filename, base64, { base64: true });
      const { screenshot, ...meta } = item;
      metadata.items.push({ ...meta, screenshotFilename: filename });
    }

    zip.file("xpath-records.json", JSON.stringify(metadata, null, 2));

    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, `xpath-records-${Date.now()}.zip`);
      showToast("ZIP download started");
    }).catch((err) => {
      console.error(err);
      showToast("ZIP generation failed");
    });
  });
});

clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "clearRecords" }, (resp) => {
    if (resp && resp.success) {
      updateCount();
      showToast("Records cleared");
    } else {
      showToast("Failed to clear");
    }
  });
});

cropCheckbox.addEventListener("change", (ev) => {
  const val = !!ev.target.checked;
  chrome.storage.local.set({ [CROPPING_PREF_KEY]: val }, () => {
    showToast(val ? "Cropping enabled" : "Cropping disabled");
  });
});

// Listen to storage changes to update count instantly
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[RECORDS_KEY]) {
    updateCount();
  }
  if (area === "local" && changes[RECORDING_KEY]) {
    setRecordingUI(!!changes[RECORDING_KEY].newValue);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadRecordingState();
  updateCount();
  // load cropping preference
  chrome.storage.local.get(CROPPING_PREF_KEY, (res) => {
    const val = res[CROPPING_PREF_KEY];
    cropCheckbox.checked = val !== false;
  });
});
