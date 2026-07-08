const EMOJI = { goldfish: "🐠", tropical: "🐡", shark: "🦈" };

const speciesGrid = document.getElementById("speciesGrid");
const cameraBox = document.getElementById("cameraBox");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const startCameraBtn = document.getElementById("startCameraBtn");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const fileInput = document.getElementById("fileInput");
const captureBtn = document.getElementById("captureBtn");
const statusBox = document.getElementById("status");

let selectedSpecies = null;
let videoEl = null;
let stream = null;
let capturedBlob = null;

function setStatus(kind, text) {
  statusBox.className = "status show " + kind;
  statusBox.textContent = text;
}
function clearStatus() {
  statusBox.className = "status";
  statusBox.textContent = "";
}

function refreshSendButton() {
  captureBtn.disabled = !(selectedSpecies && capturedBlob);
}

async function loadSpecies() {
  const res = await fetch("/api/species");
  const data = await res.json();
  speciesGrid.innerHTML = "";
  Object.entries(data).forEach(([key, meta], i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "species-card";
    card.innerHTML = `<span class="emoji">${EMOJI[key] || "🐟"}</span>${meta.label}`;
    card.addEventListener("click", () => {
      document.querySelectorAll(".species-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedSpecies = key;
      refreshSendButton();
    });
    speciesGrid.appendChild(card);
    if (i === 0) card.click();
  });
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (err) {
    setStatus("err", "Не удалось включить камеру. Загрузи фото кнопкой ниже.");
    return;
  }
  cameraPlaceholder.style.display = "none";
  cameraBox.innerHTML = "";
  videoEl = document.createElement("video");
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.srcObject = stream;
  cameraBox.appendChild(videoEl);
  startCameraBtn.textContent = "📸 Снять кадр";
  startCameraBtn.onclick = takeSnapshot;
}

function takeSnapshot() {
  if (!videoEl) return;
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);
  canvas.toBlob((blob) => {
    capturedBlob = blob;
    cameraBox.innerHTML = "";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    cameraBox.appendChild(img);
    refreshSendButton();
    clearStatus();
  }, "image/jpeg", 0.92);

  if (stream) stream.getTracks().forEach((t) => t.stop());
  startCameraBtn.textContent = "📷 Включить камеру";
  startCameraBtn.onclick = startCamera;
}

startCameraBtn.addEventListener("click", startCamera);

chooseFileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  capturedBlob = file;
  cameraPlaceholder.style.display = "none";
  cameraBox.innerHTML = "";
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  cameraBox.appendChild(img);
  refreshSendButton();
  clearStatus();
});

captureBtn.addEventListener("click", async () => {
  if (!selectedSpecies || !capturedBlob) return;
  captureBtn.disabled = true;
  setStatus("busy", "Ищу рамку и вырезаю рыбку… 🔍");

  const form = new FormData();
  form.append("photo", capturedBlob, "photo.jpg");
  form.append("species", selectedSpecies);

  try {
    const res = await fetch("/api/scan", { method: "POST", body: form });
    if (res.status === 422) {
      const err = await res.json();
      setStatus("err", "Рамку не видно целиком на фото. Сфотографируй ровнее и попробуй снова.");
      refreshSendButton();
      return;
    }
    if (!res.ok) throw new Error("server error");
    const data = await res.json();
    if (data.walls_notified === 0) {
      setStatus("ok", "Рыбка готова, но ни один экран сейчас не подключён 🐠");
    } else {
      setStatus("ok", "Рыбка уже плывёт на стене! 🌊");
    }
    capturedBlob = null;
    cameraBox.innerHTML = "";
    cameraPlaceholder.style.display = "block";
    cameraPlaceholder.textContent = "Нажми «Включить камеру» или загрузи фото";
    cameraBox.appendChild(cameraPlaceholder);
  } catch (err) {
    setStatus("err", "Не получилось отправить рыбку. Проверь соединение и попробуй снова.");
  } finally {
    refreshSendButton();
  }
});

loadSpecies();
