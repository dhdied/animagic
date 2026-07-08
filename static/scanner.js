const chooseFileBtn = document.getElementById("chooseFileBtn");
const captureBtn = document.getElementById("captureBtn");
const statusBox = document.getElementById("status");
const uploadText = document.getElementById("uploadText");
const burgerBtn = document.getElementById("burgerBtn");
const instructionsPanel = document.getElementById("instructionsPanel");

// Элементы модального окна и инпуты
const uploadModal = document.getElementById("uploadModal");
const btnCamera = document.getElementById("btnCamera");
const btnGallery = document.getElementById("btnGallery");
const btnCancel = document.getElementById("btnCancel");
const cameraInput = document.getElementById("cameraInput");
const galleryInput = document.getElementById("galleryInput");

let capturedBlob = null;
let defaultSpecies = "goldfish";
let statusTimeout = null;

// === ЛОГИКА ОТОБРАЖЕНИЯ СТАТУСОВ ===
function showStatus(message, type) {
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }
  
  statusBox.textContent = message;
  statusBox.className = `status show ${type}`;
  
  statusTimeout = setTimeout(() => {
    hideStatus();
  }, 7000);
}

function hideStatus() {
  statusBox.className = "status";
}

// === ЛОГИКА МЕНЮ-БУРГЕРА ===
burgerBtn.addEventListener("click", () => {
  instructionsPanel.classList.toggle("open");
});

// === ЛОГИКА МОДАЛЬНОГО ОКНА ВЫБОРА ===
// Открываем модалку при клике на черную кнопку
chooseFileBtn.addEventListener("click", () => {
  uploadModal.classList.add("active");
});

// Закрываем модалку по кнопке "Отмена"
btnCancel.addEventListener("click", () => {
  uploadModal.classList.remove("active");
});

// Закрываем модалку при клике на размытый фон (вне окна)
uploadModal.addEventListener("click", (e) => {
  if (e.target === uploadModal) {
    uploadModal.classList.remove("active");
  }
});

// Клик по "Сделать фото" -> триггерим инпут камеры
btnCamera.addEventListener("click", () => {
  cameraInput.click();
  uploadModal.classList.remove("active");
});

// Клик по "Галерея" -> триггерим инпут галереи
btnGallery.addEventListener("click", () => {
  galleryInput.click();
  uploadModal.classList.remove("active");
});

// === ОБРАБОТКА ВЫБРАННОГО ФАЙЛА (ДЛЯ ОБОИХ ИНПУТОВ) ===
function handleFileSelection(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  capturedBlob = file;
  
  uploadText.textContent = "Фото выбрано";
  uploadText.style.color = "#fff"; 
  captureBtn.disabled = false;
  hideStatus();
  
  // Очищаем value, чтобы можно было выбрать тот же файл еще раз, если нужно
  event.target.value = ""; 
}

cameraInput.addEventListener("change", handleFileSelection);
galleryInput.addEventListener("change", handleFileSelection);

// === ОТПРАВКА НА СЕРВЕР ===
captureBtn.addEventListener("click", async () => {
  if (!capturedBlob) return;
  
  captureBtn.disabled = true;
  showStatus("Ищу рамку и вырезаю рыбку... 🔍", "loading");

  const form = new FormData();
  form.append("photo", capturedBlob, "photo.jpg");
  form.append("species", defaultSpecies);

  try {
    const res = await fetch("/api/scan", { method: "POST", body: form });
    
    if (res.status === 422) {
      showStatus("Рамку не видно целиком. Попробуй снова.", "error");
      captureBtn.disabled = false;
      return;
    }
    
    if (!res.ok) throw new Error("server error");
    
    const data = await res.json();
    
    if (data.walls_notified === 0) {
      showStatus("🐠 Готово, но экраны не подключены.", "success");
    } else {
      showStatus("🌊 Рыбка уже плывет на стене!", "success");
    }
    
    capturedBlob = null;
    uploadText.textContent = "Загрузка изображения";
    uploadText.style.color = "#999";
    
  } catch (err) {
    showStatus("Ошибка соединения. Проверь сеть.", "error");
    captureBtn.disabled = false;
  }
});

// ==========================================
// ФОНОВЫЕ РЫБКИ (ПЛАВНАЯ АНИМАЦИЯ)
// ==========================================
const bgCanvas = document.getElementById("bgCanvas");
const ctx = bgCanvas.getContext("2d");

let canvasWidth, canvasHeight;

function resizeCanvas() {
  canvasWidth = bgCanvas.width = window.innerWidth;
  canvasHeight = bgCanvas.height = window.innerHeight;
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

    ctx.strokeStyle = "rgba(160, 160, 170, 0.25)"; 
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