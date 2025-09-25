let recordings = [];

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.imgUrl) {
    recordings.push({
      xpath: msg.data.xpath,
      cssPath: msg.data.cssPath,
      image: msg.imgUrl
    });
    render();
  }
});

function render() {
  let container = document.getElementById("recordings");
  container.innerHTML = "";
  recordings.forEach((rec, i) => {
    let shortXpath = rec.xpath.length > 40 ? rec.xpath.slice(0, 40) + "..." : rec.xpath;

    let div = document.createElement("div");
    div.className = "recording";
    div.innerHTML = `
      <div class="recording-header">
        <span>Element ${i + 1}: ${shortXpath}</span>
        <button class="toggle-btn" data-index="${i}">Show</button>
      </div>
      <div class="recording-details" id="details-${i}">
        <p><b>XPath:</b> ${rec.xpath}</p>
        <p><b>CSS:</b> ${rec.cssPath}</p>
        <img src="${rec.image}" />
      </div>
    `;
    container.appendChild(div);
  });

  // Toggle events
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      let idx = e.target.dataset.index;
      let details = document.getElementById("details-" + idx);
      if (details.style.display === "block") {
        details.style.display = "none";
        e.target.textContent = "Show";
      } else {
        details.style.display = "block";
        e.target.textContent = "Hide";
      }
    });
  });
}

// Export
document.getElementById("export").addEventListener("click", () => {
  let blob = new Blob([JSON.stringify(recordings, null, 2)], { type: "application/json" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "recordings.json";
  a.click();
});


function updateStatus(isRecording) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");

  if (isRecording) {
    dot.classList.add("recording");
    text.textContent = "Recording...";
  } else {
    dot.classList.remove("recording");
    text.textContent = "Not Recording";
  }
}
