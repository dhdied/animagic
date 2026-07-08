import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const canvas3d = document.getElementById("scene3d");
const statusDot = document.getElementById("statusDot");
const hint = document.getElementById("hint");
const emptyMsg = document.getElementById("emptyMsg");
const dayNightBtn = document.getElementById("dayNightBtn");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// Day/Night State & Lerp Utils
// ---------------------------------------------------------------
let isNight = true;
let timeFactor = 1.0; // 1.0 = Ночь, 0.0 = День

dayNightBtn.addEventListener("click", () => {
  isNight = !isNight;
  dayNightBtn.textContent = isNight ? "🌙" : "☀️";
});

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  const hex1 = parseInt(c1.replace('#', ''), 16);
  const hex2 = parseInt(c2.replace('#', ''), 16);
  
  const r1 = (hex1 >> 16) & 255, g1 = (hex1 >> 8) & 255, b1 = hex1 & 255;
  const r2 = (hex2 >> 16) & 255, g2 = (hex2 >> 8) & 255, b2 = hex2 & 255;
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// ---------------------------------------------------------------
// Three.js 3D setup
// ---------------------------------------------------------------
const renderer3d = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: true });
renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer3d.setClearColor(0x000000, 0);

const scene3d = new THREE.Scene();
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene3d.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xb4befe, 0.8);
dirLight.position.set(0.5, 1, 0.5);
scene3d.add(dirLight);

const camera3d = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
camera3d.position.set(0, 0, 10);
camera3d.lookAt(0, 0, 0);

const fbxLoader = new FBXLoader();

let W = 0, H = 0;

// === СИСТЕМА ДЕКОРАЦИЙ ===
let bubbles = [];
let plankton = [];
let flora = [];
let lightRays = [];

function initEnvironment() {
  bubbles = Array.from({ length: 35 }, () => ({
    x: Math.random(), 
    y: Math.random(),
    r: 1.5 + Math.random() * 4,
    speed: 15 + Math.random() * 25,
    wobble: Math.random() * Math.PI * 2,
  }));

  plankton = Array.from({ length: 150 }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: 0.5 + Math.random() * 1.5,
    speedX: (Math.random() - 0.5) * 0.0005,
    speedY: -0.0005 - Math.random() * 0.001,
    phase: Math.random() * Math.PI * 2,
    color: Math.random() > 0.5 ? '#b4befe' : '#cba6f7'
  }));

  lightRays = Array.from({ length: 6 }, (_, i) => ({
    baseX: (i / 5) + (Math.random() * 0.2 - 0.1),
    width: 0.05 + Math.random() * 0.15,
    angle: 0.15 + Math.random() * 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: 0.0002 + Math.random() * 0.0003
  }));

  flora = [];
  const numFlora = Math.floor(W / 45); 
  for(let i = 0; i < numFlora; i++) {
    const isGlowing = Math.random() > 0.7;
    const strands = [];
    const numStrands = 2 + Math.floor(Math.random() * 3);
    
    for(let s = 0; s < numStrands; s++) {
      strands.push({
        offsetX: (Math.random() - 0.5) * 20,
        height: 80 + Math.random() * 120,
        phase: Math.random() * Math.PI * 2,
        swayAmt: 10 + Math.random() * 15
      });
    }
    
    // Задаем уникальные цвета для ночи и дня
    const nColor = isGlowing ? (Math.random() > 0.5 ? '#cba6f7' : '#b4befe') : '#1e3846';
    const dColor = isGlowing ? (Math.random() > 0.5 ? '#8bd450' : '#4ade80') : '#2d6a4f';

    flora.push({
      x: (W / numFlora) * i + (Math.random() * 30 - 15),
      isGlowing: isGlowing,
      nightColor: nColor,
      dayColor: dColor,
      strands: strands
    });
  }
}

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  renderer3d.setSize(W, H);
  camera3d.left = 0;
  camera3d.right = W;
  camera3d.top = H;
  camera3d.bottom = 0;
  camera3d.updateProjectionMatrix();
  initEnvironment();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------
// Advanced Background Rendering
// ---------------------------------------------------------------
function drawBackground(t) {
  // Плавная интерполяция времени суток (учитывает DeltaTime через кадры)
  const targetFactor = isNight ? 1.0 : 0.0;
  timeFactor += (targetFactor - timeFactor) * 0.03;

  // 1. Интерполяция градиентов океана
  const bgTop = lerpColor("#2dc2d1", "#1c2b3e", timeFactor);
  const bgMid = lerpColor("#1085ab", "#0f1722", timeFactor);
  const bgBot = lerpColor("#054a70", "#070a10", timeFactor);

  const bgGrad = ctx.createRadialGradient(W * 0.5, -H * 0.2, 0, W * 0.5, 0, H * 1.2);
  bgGrad.addColorStop(0, bgTop); 
  bgGrad.addColorStop(0.4, bgMid); 
  bgGrad.addColorStop(1, bgBot); 
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Объемные лучи света (Меняют цвет от теплого к холодному)
  if (!reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen'; 
    
    const rayR = Math.round(lerp(255, 180, timeFactor));
    const rayG = Math.round(lerp(250, 190, timeFactor));
    const rayB = Math.round(lerp(220, 254, timeFactor));
    const maxAlpha = lerp(0.15, 0.08, timeFactor); // Днем лучи ярче

    lightRays.forEach(ray => {
      const sway = Math.sin(t * ray.speed + ray.phase) * (W * 0.1);
      const startX = ray.baseX * W + sway;
      const topWidth = ray.width * W;
      const bottomWidth = topWidth * 3; 
      const endX = startX + (ray.angle * W);

      const rayGrad = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      rayGrad.addColorStop(0, `rgba(${rayR}, ${rayG}, ${rayB}, ${maxAlpha})`); 
      rayGrad.addColorStop(1, `rgba(${rayR}, ${rayG}, ${rayB}, 0)`);

      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(startX - topWidth/2, 0);
      ctx.lineTo(startX + topWidth/2, 0);
      ctx.lineTo(endX + bottomWidth/2, H * 0.8);
      ctx.lineTo(endX - bottomWidth/2, H * 0.8);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  // 3. Планктон (Днем почти полностью исчезает)
  if (!reducedMotion) {
    ctx.save();
    plankton.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      if(p.y < 0) { p.y = 1; p.x = Math.random(); }
      if(p.x < 0) p.x = 1;
      if(p.x > 1) p.x = 0;

      // Умножаем на timeFactor: ночью планктон виден, днем - нет
      const alpha = (Math.sin(t * 0.002 + p.phase) * 0.5 + 0.5) * 0.6 * timeFactor;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // 4. Реалистичные пузырьки 
  ctx.save();
  ctx.lineWidth = 1;
  bubbles.forEach(b => {
    const speedFactor = reducedMotion ? 0 : 1;
    b.y -= (b.speed / H) * 0.016 * speedFactor;
    if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
    const wobbleX = reducedMotion ? 0 : Math.sin(t * 0.002 + b.wobble) * (W * 0.005);
    
    const bx = b.x * W + wobbleX;
    const by = b.y * H;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.arc(bx, by, b.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(bx, by, b.r * 0.7, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
  });
  ctx.restore();

  // 5. Многослойное дно (Теплый песок днем, темный ночью)
  const bgSandDayTop = "#d4a373", bgSandDayBot = "#b5835a";
  const bgSandNightTop = "#0b1219", bgSandNightBot = "#05080c";
  
  const fgSandDayTop = "#e9c496", fgSandDayBot = "#c99b6d";
  const fgSandNightTop = "#131e2a", fgSandNightBot = "#090d14";

  const sandTopBg = H * 0.88;
  const bgSandGrad = ctx.createLinearGradient(0, sandTopBg, 0, H);
  bgSandGrad.addColorStop(0, lerpColor(bgSandDayTop, bgSandNightTop, timeFactor));
  bgSandGrad.addColorStop(1, lerpColor(bgSandDayBot, bgSandNightBot, timeFactor));
  ctx.fillStyle = bgSandGrad;
  ctx.beginPath();
  ctx.moveTo(0, sandTopBg + 20);
  for (let x = 0; x <= W; x += W / 5) {
    ctx.quadraticCurveTo(x + W / 10, sandTopBg - 15, x + W / 5, sandTopBg + 20);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

  const sandTopFg = H * 0.92;
  const fgSandGrad = ctx.createLinearGradient(0, sandTopFg, 0, H);
  fgSandGrad.addColorStop(0, lerpColor(fgSandDayTop, fgSandNightTop, timeFactor));
  fgSandGrad.addColorStop(1, lerpColor(fgSandDayBot, fgSandNightBot, timeFactor));
  ctx.fillStyle = fgSandGrad;
  ctx.beginPath();
  ctx.moveTo(0, sandTopFg);
  for (let x = -W/10; x <= W; x += W / 4) {
    ctx.quadraticCurveTo(x + W / 8, sandTopFg - 25, x + W / 4, sandTopFg + 5);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

  // 6. Флора (Светится только ночью)
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  flora.forEach(plant => {
    ctx.lineWidth = plant.isGlowing ? 2.5 : 4;
    
    // Плавный переход цвета
    const currentColor = lerpColor(plant.dayColor, plant.nightColor, timeFactor);
    ctx.strokeStyle = currentColor;
    
    if (plant.isGlowing) {
      // Свечение работает только ночью (timeFactor -> 1)
      ctx.shadowBlur = 12 * timeFactor; 
      ctx.shadowColor = currentColor;
    } else {
      ctx.shadowBlur = 0;
    }

    plant.strands.forEach(strand => {
      ctx.beginPath();
      for (let y = H + 20; y >= H - strand.height; y -= 8) {
        const tPos = (H + 20 - y) / strand.height; 
        const sway = Math.sin(t * 0.0015 - tPos * 3 + strand.phase) * (strand.swayAmt * tPos);
        const px = plant.x + strand.offsetX + sway;
        if (y === H + 20) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    });
  });
  ctx.restore();

  // 7. Обновление освещения 3D-моделей
  ambientLight.intensity = lerp(1.1, 0.7, timeFactor); // Днем ярче
  dirLight.intensity = lerp(1.2, 0.8, timeFactor);
  
  // Three.js lerpColors
  const dLightDay = new THREE.Color(0xfff9e6);
  const dLightNight = new THREE.Color(0xb4befe);
  dirLight.color.lerpColors(dLightDay, dLightNight, timeFactor);
}

// ---------------------------------------------------------------
// Food 
// ---------------------------------------------------------------
const foods = [];
canvas.addEventListener("pointerdown", (e) => {
  foods.push({ x: e.clientX, y: e.clientY, born: performance.now(), sink: 0 });
  hint.style.opacity = "0";
});

function updateAndDrawFood(t) {
  ctx.save();
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    const age = t - f.born;
    if (age > 12000) { foods.splice(i, 1); continue; }
    f.sink += 0.12; 
    
    const alpha = Math.max(0, 1 - age / 12000);
    ctx.globalAlpha = alpha;
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#F2C14E";
    ctx.fillStyle = "#fff5d1";
    ctx.beginPath();
    ctx.arc(f.x, f.y + f.sink, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; 
  }
  ctx.restore();
}

// ---------------------------------------------------------------
// Fish
// ---------------------------------------------------------------
const EAT_RADIUS = 34;
const ATTRACT_RADIUS = 420;
const TURN_RATE = 4.5;
const ACCEL = 280;
const MARGIN = 60;
const MAX_FISH = 40;

const fish = [];

class Fish {
  constructor(data) {
    this.id = data.id;
    this.pattern = data.pattern || "free";
    this.speedBase = 55 * (data.speed || 1);
    this.scaleMul = data.scale || 1;
    this.img = new Image();
    this.img.src = data.image;
    this.ready = false;
    this.img.onload = () => { this.ready = true; };

    this.x = Math.random() * W * 0.6 + W * 0.2;
    this.y = Math.random() * H * 0.5 + H * 0.15;
    this.vx = (Math.random() - 0.5) * this.speedBase;
    this.vy = (Math.random() - 0.5) * this.speedBase * 0.4;
    this.tvx = this.vx;
    this.tvy = this.vy;
    this.angle = Math.atan2(this.vy, this.vx);
    this.facing = this.vx >= 0 ? 1 : -1;
    this.pulse = 0;

    this.baseY = this.y;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * Math.PI * 2;

    this.cx = this.x;
    this.cy = this.y;
    this.radius = 60 + Math.random() * 90;
    this.angularSpeed = (0.4 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
    this.circleAngle = Math.random() * Math.PI * 2;

    this.wanderAngle = Math.atan2(this.vy, this.vx);
    this.wanderTimer = 0;
    this.wanderDir = this.wanderAngle;

    this.eatingFoodIndex = -1;
  }

  targetFood() {
    let best = -1, bestDist = ATTRACT_RADIUS;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  setTarget(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    this.tvx = (vx / len) * Math.min(len, this.speedBase * 1.8);
    this.tvy = (vy / len) * Math.min(len, this.speedBase * 1.8);
  }

  steer(dt) {
    const dx = this.tvx - this.vx;
    const dy = this.tvy - this.vy;
    const step = ACCEL * dt;
    const d = Math.hypot(dx, dy);
    if (d <= step || d < 0.0001) {
      this.vx = this.tvx;
      this.vy = this.tvy;
    } else {
      this.vx += (dx / d) * step;
      this.vy += (dy / d) * step;
    }
  }

  faceVelocity(dt) {
    const target = Math.atan2(this.vy, this.vx);
    let diff = target - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = TURN_RATE * dt;
    if (Math.abs(diff) <= maxStep) this.angle = target;
    else this.angle += Math.sign(diff) * maxStep;
    this.facing = Math.cos(this.angle) >= 0 ? 1 : -1;
  }

  keepInBounds() {
    if (this.x < MARGIN)             this.setTarget( Math.abs(this.tvx) || this.speedBase, this.tvy);
    if (this.x > W - MARGIN)         this.setTarget(-Math.abs(this.tvx) || -this.speedBase, this.tvy);
    if (this.y < MARGIN)             this.setTarget(this.tvx,  Math.abs(this.tvy) || this.speedBase * 0.4);
    if (this.y > H * 0.82)           this.setTarget(this.tvx, -Math.abs(this.tvy) || -this.speedBase * 0.4);
  }

  update(dt) {
    const foodIdx = this.targetFood();

    if (foodIdx >= 0) {
      const f = foods[foodIdx];
      const tx = f.x - this.x;
      const ty = (f.y + f.sink) - this.y;
      const dist = Math.hypot(tx, ty) || 1;
      this.setTarget((tx / dist) * this.speedBase * 1.8, (ty / dist) * this.speedBase * 1.8);

      if (dist < EAT_RADIUS) {
        foods.splice(foodIdx, 1);
        this.pulse = 1;
      }
    } else if (this.pattern === "sine") {
      this.dir = this.x < MARGIN ? 1 : (this.x > W - MARGIN ? -1 : this.dir);
      this.phase += dt * 1.6;
      this.setTarget(this.dir * this.speedBase, Math.cos(this.phase) * this.speedBase * 0.6);
    } else if (this.pattern === "circle") {
      this.circleAngle += this.angularSpeed * dt;
      this.cx += Math.cos(performance.now() * 0.00007 + this.id.length) * 6 * dt;
      this.cy += Math.sin(performance.now() * 0.00005) * 4 * dt;
      this.cx = Math.min(Math.max(this.cx, this.radius + 40), W - this.radius - 40);
      this.cy = Math.min(Math.max(this.cy, this.radius + 40), H * 0.8 - this.radius);
      const tx = -Math.sin(this.circleAngle) * this.angularSpeed;
      const ty =  Math.cos(this.circleAngle) * this.angularSpeed * 0.6;
      this.setTarget(tx * this.speedBase, ty * this.speedBase);
    } else if (this.pattern === "free") {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1.5 + Math.random() * 3;
        this.wanderDir = Math.random() * Math.PI * 2;
      }
      this.setTarget(
        Math.cos(this.wanderDir) * this.speedBase,
        Math.sin(this.wanderDir) * this.speedBase * 0.55
      );
    } else {
      this.wanderAngle += (Math.random() - 0.5) * 1.4 * dt;
      this.setTarget(
        Math.cos(this.wanderAngle) * this.speedBase,
        Math.sin(this.wanderAngle) * this.speedBase
      );
    }

    this.steer(dt);
    this.faceVelocity(dt);
    this.keepInBounds();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 2);
  }

  draw(t) {
    if (!this.ready) return;
    const baseH = 90 * this.scaleMul * (1 + this.pulse * 0.35);
    const aspect = this.img.naturalWidth / this.img.naturalHeight;
    const h = baseH;
    const w = baseH * aspect;
    const wiggle = reducedMotion ? 0 : Math.sin(t * 0.006 + this.x * 0.01) * 0.06;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(-1, this.facing >= 0 ? 1 : -1);
    ctx.rotate(wiggle * this.facing);
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    
    ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/wall`);

  ws.onopen = () => { statusDot.classList.add("online"); };
  ws.onclose = () => { statusDot.classList.remove("online"); setTimeout(connectWS, 1500); };
  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "new_fish" || msg.type === "new_fish_3d") {
      emptyMsg.style.display = "none";
      fish.push(new Fish(msg));
      while (fish.length > MAX_FISH) {
        fish.shift();
      }
    }
    if (msg.type === "new_fish_3d_animated") {
      emptyMsg.style.display = "none";
      fish3d.push(new AnimatedFish3D(msg));
      while (fish3d.length > MAX_FISH) {
        const old = fish3d.shift();
        scene3d.remove(old.group);
      }
    }
  };
}
connectWS();

const fish3d = [];

class AnimatedFish3D {
  constructor(data) {
    this.id = data.id;
    this.pattern = data.pattern || "free";
    this.speedBase = 55 * (data.speed || 1);
    this.scaleMul = data.scale || 1;
    this.fbxUrl = data.fbx_url;
    this.textureImage = data.image; 

    this.x = Math.random() * W * 0.6 + W * 0.2;
    this.y = Math.random() * H * 0.5 + H * 0.15;
    this.vx = (Math.random() - 0.5) * this.speedBase;
    this.vy = (Math.random() - 0.5) * this.speedBase * 0.4;
    this.tvx = this.vx;
    this.tvy = this.vy;
    this.angle = Math.atan2(this.vy, this.vx);
    this.facing = this.vx >= 0 ? 1 : -1;
    this.pulse = 0;

    this.baseY = this.y;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * Math.PI * 2;
    this.cx = this.x;
    this.cy = this.y;
    this.radius = 60 + Math.random() * 90;
    this.angularSpeed = (0.4 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
    this.circleAngle = Math.random() * Math.PI * 2;
    this.wanderAngle = Math.atan2(this.vy, this.vx);
    this.wanderTimer = 0;
    this.wanderDir = this.wanderAngle;
    this.eatingFoodIndex = -1;

    this.group = new THREE.Group();
    this.group.visible = false; 
    this.model = null;
    this.animationMixer = null;
    this.animationAction = null;
    this.ready = false;
    this.dead = false;

    scene3d.add(this.group);
    this._loadModel();
  }

  async _loadModel() {
    try {
      const model = await fbxLoader.loadAsync(this.fbxUrl);
      this.model = model;

      const textureImg = new Image();
      await new Promise((resolve, reject) => {
        textureImg.onload = resolve;
        textureImg.onerror = reject;
        textureImg.src = this.textureImage;
      });
      const texture = new THREE.Texture(textureImg);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of materials) {
            mat.map = texture;
            mat.color.set(0xffffff);
            mat.transparent = true;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }
        }
      });

      if (model.animations && model.animations.length > 0) {
        this.animationMixer = new THREE.AnimationMixer(model);
        this.animationAction = this.animationMixer.clipAction(model.animations[0]);
        this.animationAction.play();
      }

      const targetHeight = 120 * this.scaleMul;
      const box = new THREE.Box3().setFromObject(model);
      const modelH = box.max.y - box.min.y || 1;
      const s = targetHeight / modelH;
      model.scale.set(s, s, s);

      model.rotation.z = Math.PI / 2;

      this.group.add(model);
      this.group.visible = true;
      this.ready = true;
      this._syncPosition();
    } catch (err) {
      console.warn("Failed to load 3D model", err);
      this.dead = true;
      scene3d.remove(this.group);
    }
  }

  _syncPosition() {
    this.group.position.set(this.x, H - this.y, 0);
    this.group.rotation.z = -this.angle;
  }

  targetFood() {
    let best = -1, bestDist = ATTRACT_RADIUS;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const d = Math.hypot(f.x - this.x, f.y - this.y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  setTarget(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    this.tvx = (vx / len) * Math.min(len, this.speedBase * 1.8);
    this.tvy = (vy / len) * Math.min(len, this.speedBase * 1.8);
  }

  steer(dt) {
    const dx = this.tvx - this.vx;
    const dy = this.tvy - this.vy;
    const step = ACCEL * dt;
    const d = Math.hypot(dx, dy);
    if (d <= step || d < 0.0001) {
      this.vx = this.tvx;
      this.vy = this.tvy;
    } else {
      this.vx += (dx / d) * step;
      this.vy += (dy / d) * step;
    }
  }

  faceVelocity(dt) {
    const target = Math.atan2(this.vy, this.vx);
    let diff = target - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = TURN_RATE * dt;
    if (Math.abs(diff) <= maxStep) this.angle = target;
    else this.angle += Math.sign(diff) * maxStep;
  }

  keepInBounds() {
    if (this.x < MARGIN)             this.setTarget( Math.abs(this.tvx) || this.speedBase, this.tvy);
    if (this.x > W - MARGIN)         this.setTarget(-Math.abs(this.tvx) || -this.speedBase, this.tvy);
    if (this.y < MARGIN)             this.setTarget(this.tvx,  Math.abs(this.tvy) || this.speedBase * 0.4);
    if (this.y > H * 0.82)           this.setTarget(this.tvx, -Math.abs(this.tvy) || -this.speedBase * 0.4);
  }

  update(dt) {
    const foodIdx = this.targetFood();

    if (foodIdx >= 0) {
      const f = foods[foodIdx];
      const tx = f.x - this.x;
      const ty = (f.y + f.sink) - this.y;
      const dist = Math.hypot(tx, ty) || 1;
      this.setTarget((tx / dist) * this.speedBase * 1.8, (ty / dist) * this.speedBase * 1.8);

      if (dist < EAT_RADIUS) {
        foods.splice(foodIdx, 1);
        this.pulse = 1;
      }
    } else if (this.pattern === "sine") {
      this.dir = this.x < MARGIN ? 1 : (this.x > W - MARGIN ? -1 : this.dir);
      this.phase += dt * 1.6;
      this.setTarget(this.dir * this.speedBase, Math.cos(this.phase) * this.speedBase * 0.6);
    } else if (this.pattern === "circle") {
      this.circleAngle += this.angularSpeed * dt;
      this.cx += Math.cos(performance.now() * 0.00007 + this.id.length) * 6 * dt;
      this.cy += Math.sin(performance.now() * 0.00005) * 4 * dt;
      this.cx = Math.min(Math.max(this.cx, this.radius + 40), W - this.radius - 40);
      this.cy = Math.min(Math.max(this.cy, this.radius + 40), H * 0.8 - this.radius);
      const tx = -Math.sin(this.circleAngle) * this.angularSpeed;
      const ty =  Math.cos(this.circleAngle) * this.angularSpeed * 0.6;
      this.setTarget(tx * this.speedBase, ty * this.speedBase);
    } else if (this.pattern === "free") {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 1.5 + Math.random() * 3;
        this.wanderDir = Math.random() * Math.PI * 2;
      }
      this.setTarget(
        Math.cos(this.wanderDir) * this.speedBase,
        Math.sin(this.wanderDir) * this.speedBase * 0.55
      );
    } else {
      this.wanderAngle += (Math.random() - 0.5) * 1.4 * dt;
      this.setTarget(
        Math.cos(this.wanderAngle) * this.speedBase,
        Math.sin(this.wanderAngle) * this.speedBase
      );
    }

    this.steer(dt);
    this.faceVelocity(dt);
    this.keepInBounds();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 2);

    this._syncPosition();

    if (this.animationMixer) {
      this.animationMixer.update(dt);
    }
  }
}

// ---------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------
let lastT = performance.now();
function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;

  drawBackground(t);
  updateAndDrawFood(t);

  for (const f of fish) { f.update(dt); f.draw(t); }
  for (const f of fish3d) { if (!f.dead) f.update(dt); }

  renderer3d.render(scene3d, camera3d);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);