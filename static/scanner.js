const chooseFileBtn = document.getElementById("chooseFileBtn");
const statusBox = document.getElementById("status");
const uploadText = document.getElementById("uploadText");
const burgerBtn = document.getElementById("burgerBtn");
const instructionsPanel = document.getElementById("instructionsPanel");
const speciesGrid = document.getElementById("speciesGrid");

// Элементы нового меню действий
const mainSubmitToggle = document.getElementById("mainSubmitToggle");
const sendMenu = document.getElementById("sendMenu");
const captureBtn = document.getElementById("captureBtn");
const capture3dBtn = document.getElementById("capture3dBtn");
const captureAnimatedBtn = document.getElementById("captureAnimatedBtn");

// Элементы модалки
const uploadModal = document.getElementById("uploadModal");
const btnCamera = document.getElementById("btnCamera");
const btnGallery = document.getElementById("btnGallery");
const btnCancel = document.getElementById("btnCancel");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

const EMOJI = { goldfish: "🐠", tropical: "🐡", shark: "🦈" };

let capturedBlob = null;
let selectedSpecies = null; 
let statusTimeout = null;

// === ЛОГИКА ОТОБРАЖЕНИЯ СТАТУСОВ ===
function showStatus(message, type) {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusBox.textContent = message;
  statusBox.className = `status show ${type}`;
  statusTimeout = setTimeout(() => { hideStatus(); }, 7000);
}

function hideStatus() {
  statusBox.className = "status";
}

// Проверяем готовность
function refreshSendButton() {
  const ready = !!(selectedSpecies && capturedBlob);
  mainSubmitToggle.disabled = !ready;
  if (!ready) closeSendMenu();
}

// === ЛОГИКА ВСПЛЫВАЮЩЕГО МЕНЮ ДЕЙСТВИЙ ===
function closeSendMenu() {
  sendMenu.classList.remove("open");
  mainSubmitToggle.classList.remove("active");
}

mainSubmitToggle.addEventListener("click", (e) => {
  e.stopPropagation(); 
  sendMenu.classList.toggle("open");
  mainSubmitToggle.classList.toggle("active");
});

document.addEventListener("click", (e) => {
  if (!sendMenu.contains(e.target) && !mainSubmitToggle.contains(e.target)) {
    closeSendMenu();
  }
});


// === ЗАГРУЗКА ВИДОВ РЫБ ИЗ СЕРВЕРА ===
async function loadSpecies() {
  try {
    const res = await fetch("/api/species");
    const data = await res.json();
    speciesGrid.innerHTML = "";
    
    Object.entries(data).forEach(([key, meta], i) => {
      const card = document.createElement("div");
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
  } catch (err) {
    console.error("Не удалось загрузить список рыбок", err);
  }
}

// === ЛОГИКА МЕНЮ-БУРГЕРА ===
burgerBtn.addEventListener("click", () => {
  instructionsPanel.classList.toggle("open");
});

// === ЛОГИКА МОДАЛЬНОГО ОКНА ВЫБОРА ФОТО ===
chooseFileBtn.addEventListener("click", () => {
  uploadModal.classList.add("active");
});

btnCancel.addEventListener("click", () => {
  uploadModal.classList.remove("active");
});

uploadModal.addEventListener("click", (e) => {
  if (e.target === uploadModal) uploadModal.classList.remove("active");
});

btnCamera.addEventListener("click", () => {
  cameraInput.click();
  uploadModal.classList.remove("active");
});

btnGallery.addEventListener("click", () => {
  galleryInput.click();
  uploadModal.classList.remove("active");
});

// === ОБРАБОТКА ВЫБРАННОГО ФАЙЛА ===
function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  capturedBlob = file;
  uploadText.textContent = "Фото выбрано";
  uploadText.style.color = "#fff"; 
  hideStatus();
  refreshSendButton();
  event.target.value = ""; 
}

cameraInput.addEventListener("change", handleFileSelection);
galleryInput.addEventListener("change", handleFileSelection);

// === 1. ОТПРАВКА НА СТЕНУ (2D) ===
captureBtn.addEventListener("click", async () => {
  if (!selectedSpecies || !capturedBlob) return;
  
  closeSendMenu();
  mainSubmitToggle.disabled = true;
  showStatus("Ищу рамку и вырезаю рыбку... 🔍", "loading");

  const form = new FormData();
  form.append("photo", capturedBlob, "photo.jpg");
  form.append("species", selectedSpecies);

  try {
    const res = await fetch("/api/scan", { method: "POST", body: form });
    
    if (res.status === 422) {
      showStatus("Рамку не видно целиком. Попробуй снова.", "error");
      refreshSendButton();
      return;
    }
    
    if (!res.ok) throw new Error("server error");
    
    const data = await res.json();
    if (data.walls_notified === 0) {
      showStatus("🐠 Готово, но экраны не подключены.", "success");
    } else {
      showStatus("🌊 Рыбка уже плывет на стене!", "success");
    }
    resetUploadState();
  } catch (err) {
    showStatus("Ошибка соединения. Проверь сеть.", "error");
    refreshSendButton();
  }
});

// === 2. СОЗДАНИЕ 3D-МОДЕЛИ (.fbx) ===
capture3dBtn.addEventListener("click", async () => {
  if (!selectedSpecies || !capturedBlob) return;
  
  closeSendMenu();
  mainSubmitToggle.disabled = true;
  showStatus("Генерирую 3D-модель... 🐟", "loading");

  const form = new FormData();
  form.append("photo", capturedBlob, "photo.jpg");
  form.append("species", selectedSpecies);

  try {
    const res = await fetch("/api/scan3d", { method: "POST", body: form });
    if (res.status === 422) {
      showStatus("Рамку не видно целиком на фото. Попробуй снова.", "error");
      refreshSendButton();
      return;
    }
    if (res.status === 503) {
      showStatus("Unity не установлен и Python-фолбэк не сработал.", "error");
      refreshSendButton();
      return;
    }
    if (!res.ok) throw new Error("server error " + res.status);
    
    const data = await res.json();
    showStatus(`3D-модель готова (${(data.fbx_size / 1024).toFixed(1)} КБ).`, "success");
    
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = data.fbx_url;
      a.download = "fish.fbx";
      a.click();
    }, 600);
    resetUploadState();
  } catch (err) {
    showStatus("Не получилось сгенерировать 3D: " + err.message, "error");
    refreshSendButton();
  }
});

// === 3. СОЗДАНИЕ АНИМИРОВАННОЙ 3D-МОДЕЛИ ===
captureAnimatedBtn.addEventListener("click", async () => {
  if (!selectedSpecies || !capturedBlob) return;
  
  closeSendMenu();
  mainSubmitToggle.disabled = true;
  showStatus("Генерирую анимированную 3D-модель... 🐠", "loading");

  const form = new FormData();
  form.append("photo", capturedBlob, "photo.jpg");
  form.append("species", selectedSpecies);

  try {
    const res = await fetch("/api/scan3d_animated", { method: "POST", body: form });
    if (res.status === 422) {
      showStatus("Рамку не видно целиком на фото. Попробуй снова.", "error");
      refreshSendButton();
      return;
    }
    if (res.status === 503) {
      showStatus("Базовая 3D-модель не найдена на сервере.", "error");
      refreshSendButton();
      return;
    }
    if (!res.ok) throw new Error("server error " + res.status);
    
    const data = await res.json();
    showStatus(`Анимированная модель готова (${(data.fbx_size / 1024).toFixed(1)} КБ).`, "success");
    
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = data.fbx_url;
      a.download = "fish_animated.fbx";
      a.click();
    }, 600);
    resetUploadState();
  } catch (err) {
    showStatus("Ошибка генерации анимации: " + err.message, "error");
    refreshSendButton();
  }
});

function resetUploadState() {
  capturedBlob = null;
  uploadText.textContent = "Загрузка изображения";
  uploadText.style.color = "#999";
  refreshSendButton();
}

// ==========================================
// ФОНОВЫЕ РЫБКИ И ВОДОРОСЛИ (ПЛАВНАЯ АНИМАЦИЯ)
// ==========================================
const bgCanvas = document.getElementById("bgCanvas");
const ctx = bgCanvas.getContext("2d");

let canvasWidth, canvasHeight;
let seaweeds = [];

function resizeCanvas() {
  canvasWidth = bgCanvas.width = window.innerWidth;
  canvasHeight = bgCanvas.height = window.innerHeight;
  
  // Генерируем "кусты" водорослей
  seaweeds = [];
  const numWeeds = Math.floor(canvasWidth / 70); 
  for(let i = 0; i < numWeeds; i++) {
    const strands = [];
    const numStrands = 2 + Math.floor(Math.random() * 2); // 2-3 стебелька в кусте
    
    for(let s = 0; s < numStrands; s++) {
      strands.push({
        offsetX: (Math.random() - 0.5) * 15, // Легкий разброс корней внутри куста
        height: 50 + Math.random() * 70,     // Разная высота стеблей
        phase: Math.random() * Math.PI * 2,  // Разная начальная фаза колебаний
        speed: 0.5 + Math.random() * 0.5,    // Скорость течения
        swayAmt: 12 + Math.random() * 8      // Размах колыхания
      });
    }
    
    seaweeds.push({
      x: (canvasWidth / numWeeds) * i + (Math.random() * 40 - 20),
      strands: strands
    });
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const fishCount = 24; 
const fishes = [];

for (let i = 0; i < fishCount; i++) {
  fishes.push({
    x: Math.random() * canvasWidth,
    y: Math.random() * canvasHeight,
    angle: Math.random() * Math.PI * 2, 
    speed: 0.4 + Math.random() * 0.5,   
    size: 0.7 + Math.random() * 0.5,    
    offset: Math.random() * 100         
  });
}

let time = 0;

function animateBackground() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  time += 0.05;

  // --- Отрисовка живых водорослей ---
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(18, 140, 126, 0.25)"; // Мягкий бирюзовый оттенок
  
  seaweeds.forEach(sw => {
    sw.strands.forEach(strand => {
      ctx.beginPath();
      // Отрисовываем стебелек сегментами снизу вверх
      for (let y = canvasHeight + 10; y >= canvasHeight - strand.height; y -= 5) {
        const t = (canvasHeight + 10 - y) / strand.height; // t меняется от 0 (корень) до 1 (верхушка)
        // Синусоида с фазовым сдвигом от высоты (t*4) дает эффект "ползущей змейки"
        const sway = Math.sin(time * strand.speed + strand.phase - t * 4) * (strand.swayAmt * t);
        const px = sw.x + strand.offsetX + sway;
        
        if (y === canvasHeight + 10) {
          ctx.moveTo(px, y);
        } else {
          ctx.lineTo(px, y);
        }
      }
      ctx.stroke();
    });
  });

  // --- Отрисовка серых рыбок ---
  fishes.forEach(f => {
    f.angle += (Math.random() - 0.5) * 0.015;
    f.x += Math.cos(f.angle) * f.speed;
    f.y += Math.sin(f.angle) * f.speed;

    if (f.x < -100) f.x = canvasWidth + 100;
    if (f.x > canvasWidth + 100) f.x = -100;
    if (f.y < -100) f.y = canvasHeight + 100;
    if (f.y > canvasHeight + 100) f.y = -100;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.scale(f.size, f.size);

    ctx.strokeStyle = "rgba(160, 160, 170, 0.25)"; // Обычный серый
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(15, 0); 
    ctx.quadraticCurveTo(0, -10, -15, 0); 
    ctx.quadraticCurveTo(0, 10, 15, 0);   

    const tailWobble = Math.sin(time * f.speed + f.offset) * 5;

    ctx.moveTo(-15, 0);
    ctx.lineTo(-26, -8 + tailWobble);
    ctx.lineTo(-20, 0);
    ctx.lineTo(-26, 8 + tailWobble);
    ctx.closePath(); 

    ctx.moveTo(-2, -8);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-10, -6);

    ctx.stroke();
    ctx.restore();
  });
  
  requestAnimationFrame(animateBackground);
}

animateBackground();
loadSpecies();