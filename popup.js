let recordings = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
    let div = document.createElement("div");
    div.innerHTML = `
      <p><b>XPath:</b> ${rec.xpath}</p>
      <p><b>CSS:</b> ${rec.cssPath}</p>
      <img src="${rec.image}" width="200"/>
      <hr/>
    `;
    container.appendChild(div);
  });
}

document.getElementById("export").addEventListener("click", () => {
  let blob = new Blob([JSON.stringify(recordings, null, 2)], { type: "application/json" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "recordings.json";
  a.click();
});
