/* Keep Swagger's multipart request and authorization; help fill its file array. */
(() => {
  const UPLOAD_PATH = "/api/v1/datasets/upload";
  const DROPZONE_CLASS = "pneuma-upload-dropzone";
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  const style = document.createElement("style");
  style.textContent = `
    .${DROPZONE_CLASS} { border: 2px dashed #49b882; border-radius: 8px;
      background: #f3fcf7; padding: 18px; margin: 14px 0; cursor: pointer; }
    .${DROPZONE_CLASS}:focus, .${DROPZONE_CLASS}.drag-over {
      border-color: #168455; background: #e3f7eb; outline: none; }
    .${DROPZONE_CLASS} strong { display: block; margin-bottom: 4px; }
    .${DROPZONE_CLASS} span { display: block; font-size: 13px; }
  `;
  document.head.append(style);

  function uploadBlock() {
    return [...document.querySelectorAll(".opblock")].find((block) =>
      [...block.querySelectorAll(".opblock-summary-path")].some(
        (path) => path.textContent.trim() === UPLOAD_PATH,
      ),
    );
  }

  function fileInputs(block) {
    return [...block.querySelectorAll('input[type="file"]')].filter(
      (input) => !input.classList.contains("pneuma-file-picker"),
    );
  }

  function addItemButton(block) {
    return [...block.querySelectorAll("button")].find((button) =>
      /^Add .* item$/i.test(button.textContent.trim()),
    );
  }

  async function waitForAnotherInput(block, previousCount) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await frame();
      if (fileInputs(block).length > previousCount) return true;
    }
    return false;
  }

  async function fillSwaggerInputs(block, files) {
    const status = () => block.querySelector(`.${DROPZONE_CLASS} span`);
    const csvFiles = [...files];
    if (csvFiles.some((file) => !file.name.toLowerCase().endsWith(".csv"))) {
      status().textContent = "Chỉ chọn file CSV pNEUMA.";
      return;
    }
    let added = 0;
    for (const file of csvFiles) {
      let input = fileInputs(block).find((candidate) => candidate.files.length === 0);
      if (!input) {
        const button = addItemButton(block);
        if (!button) throw new Error("Không tìm thấy nút thêm file của Swagger.");
        const previousCount = fileInputs(block).length;
        button.click();
        if (!await waitForAnotherInput(block, previousCount)) {
          throw new Error("Swagger không tạo được ô chọn file tiếp theo.");
        }
        input = fileInputs(block).find((candidate) => candidate.files.length === 0);
      }
      if (!input) throw new Error("Không tìm thấy ô chọn file trống.");
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      added += 1;
      await frame();
    }
    const message = status();
    if (message) message.textContent = `Đã thêm ${added} file. Bấm Execute để upload.`;
  }

  function addDropzone() {
    const block = uploadBlock();
    if (!block || !fileInputs(block).length || block.querySelector(`.${DROPZONE_CLASS}`)) return;
    const section = fileInputs(block)[0].closest(".opblock-section-request-body");
    if (!section) return;

    const zone = document.createElement("div");
    zone.className = DROPZONE_CLASS;
    zone.tabIndex = 0;
    zone.setAttribute("role", "button");
    zone.setAttribute("aria-label", "Kéo thả hoặc chọn nhiều file CSV pNEUMA");
    zone.innerHTML = `<strong>Kéo thả nhiều file CSV vào đây hoặc bấm để chọn</strong>
      <span>Các file sẽ được thêm vào danh sách bên dưới. Sau đó bấm Execute.</span>`;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".csv,text/csv";
    picker.multiple = true;
    picker.className = "pneuma-file-picker";
    picker.hidden = true;
    zone.append(picker);
    zone.addEventListener("click", (event) => {
      if (event.target !== picker) picker.click();
    });
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        picker.click();
      }
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      fillSwaggerInputs(block, event.dataTransfer.files).catch((error) => {
        zone.querySelector("span").textContent = error.message;
      });
    });
    picker.addEventListener("change", () => {
      fillSwaggerInputs(block, picker.files).catch((error) => {
        zone.querySelector("span").textContent = error.message;
      });
      picker.value = "";
    });
    section.insertBefore(zone, section.querySelector(".opblock-section-header")?.nextSibling || section.firstChild);
  }

  const observer = new MutationObserver(addDropzone);
  observer.observe(document.body, { childList: true, subtree: true });
  addDropzone();
})();
