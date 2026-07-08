import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const canvas3d = document.getElementById("scene3d");
const statusDot = document.getElementById("statusDot");
const hint = document.getElementById("hint");
const emptyMsg = document.getElementById("emptyMsg");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------
// Three.js 3D setup
// ---------------------------------------------------------------
const renderer3d = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: true });
renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer3d.setClearColor(0x000000, 0);

const scene3d = new THREE.Scene();

// Ambient + directional light so the textured model isn't black
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene3d.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(0.3, 0.8, 1);
scene3d.add(dirLight);

// Orthographic camera — maps pixel coords 1:1.
// Blender default export: Y up, fish faces -Y.
// We rotate the model in AnimatedFish3D to face +X on screen.
const camera3d = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
camera3d.position.set(0, 0, 10);
camera3d.lookAt(0, 0, 0);

// FBXLoader singleton — we reuse it for all fish
const fbxLoader = new FBXLoader();

let W = 0, H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  renderer3d.setSize(W, H);
  camera3d.left = 0;
  camera3d.right = W;
  camera3d.top = H;
  camera3d.bottom = 0;
  camera3d.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------
// Background dressing: bubbles, light rays, sand, seaweed
// ---------------------------------------------------------------
const bubbles = Array.from({ length: 28 }, () => ({
  x: Math.random() * 1, // normalized 0..1, scaled at draw time
  y: Math.random(),
  r: 2 + Math.random() * 5,
  speed: 10 + Math.random() * 22,
  wobble: Math.random() * Math.PI * 2,
}));

function drawBackground(t) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0a4a63");
  grad.addColorStop(0.55, "#073a54");
  grad.addColorStop(1, "#03202f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Light rays
  if (!reducedMotion) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 5; i++) {
      const baseX = (W / 5) * i + Math.sin(t * 0.0002 + i) * 60;
      const rg = ctx.createLinearGradient(baseX, 0, baseX + 120, H * 0.9);
      rg.addColorStop(0, "#EAF7F7");
      rg.addColorStop(1, "transparent");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(baseX - 40, 0);
      ctx.lineTo(baseX + 120, 0);
      ctx.lineTo(baseX + 40, H * 0.9);
      ctx.lineTo(baseX - 160, H * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Bubbles
  ctx.save();
  ctx.strokeStyle = "rgba(234,247,247,0.35)";
  ctx.lineWidth = 1.2;
  for (const b of bubbles) {
    const speedFactor = reducedMotion ? 0 : 1;
    b.y -= (b.speed / H) * 0.016 * speedFactor;
    if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
    const wobbleX = reducedMotion ? 0 : Math.sin(t * 0.002 + b.wobble) * 6;
    ctx.beginPath();
    ctx.arc(b.x * W + wobbleX, b.y * H, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Sand + dunes
  const sandTop = H * 0.9;
  const sandGrad = ctx.createLinearGradient(0, sandTop, 0, H);
  sandGrad.addColorStop(0, "#1b5a3f");
  sandGrad.addColorStop(0.15, "#C9A15A");
  sandGrad.addColorStop(1, "#8a6d3a");
  ctx.fillStyle = sandGrad;
  ctx.beginPath();
  ctx.moveTo(0, sandTop + 10);
  for (let x = 0; x <= W; x += W / 10) {
    ctx.quadraticCurveTo(x + W / 20, sandTop - 6, x + W / 10, sandTop + 8);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Seaweed
  ctx.strokeStyle = "rgba(30,110,60,0.6)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const bx = W * (0.08 + i * 0.21);
    const sway = reducedMotion ? 0 : Math.sin(t * 0.0012 + i) * 18;
    ctx.beginPath();
    ctx.moveTo(bx, sandTop + 12);
    ctx.quadraticCurveTo(bx + sway, sandTop - 40, bx + sway * 0.5, sandTop - 85);
    ctx.stroke();
  }
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
    f.sink += 0.15;
    ctx.globalAlpha = Math.max(0, 1 - age / 12000);
    ctx.fillStyle = "#F2C14E";
    ctx.beginPath();
    ctx.arc(f.x, f.y + f.sink, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------
// Fish — smooth, omnidirectional movement
// ---------------------------------------------------------------
const EAT_RADIUS = 34;
const ATTRACT_RADIUS = 420;
const TURN_RATE = 4.5;   // рад/с, ограничение скорости поворота
const ACCEL = 280;       // px/с², разгон к целевой скорости
const MARGIN = 60;
const MAX_FISH = 40;     // мягкий лимит, чтобы стена не захлёбывалась

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
    // текущий вектор движения (направление + скорость)
    this.vx = (Math.random() - 0.5) * this.speedBase;
    this.vy = (Math.random() - 0.5) * this.speedBase * 0.4;
    // целевой вектор, к которому плавно стремимся
    this.tvx = this.vx;
    this.tvy = this.vy;
    // угол, в который «смотрит» рыбка (для отражения спрайта)
    this.angle = Math.atan2(this.vy, this.vx);
    this.facing = this.vx >= 0 ? 1 : -1;
    this.pulse = 0;

    // параметры паттернов
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

  // установить целевой вектор движения с ограничением по углу
  setTarget(vx, vy) {
    const len = Math.hypot(vx, vy) || 1;
    this.tvx = (vx / len) * Math.min(len, this.speedBase * 1.8);
    this.tvy = (vy / len) * Math.min(len, this.speedBase * 1.8);
  }

  // плавный поворот: vx/vy двигаются к tvx/tvy с ограничением ускорения
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

  // мягкий разворот угла рыбки в сторону вектора скорости
  faceVelocity(dt) {
    const target = Math.atan2(this.vy, this.vx);
    let diff = target - this.angle;
    // нормализуем разницу углов к [-π, π]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = TURN_RATE * dt;
    if (Math.abs(diff) <= maxStep) this.angle = target;
    else this.angle += Math.sign(diff) * maxStep;
    this.facing = Math.cos(this.angle) >= 0 ? 1 : -1;
  }

  keepInBounds() {
    // отскок от стен — задаём целевой вектор вглубь сцены
    if (this.x < MARGIN)             this.setTarget( Math.abs(this.tvx) || this.speedBase, this.tvy);
    if (this.x > W - MARGIN)         this.setTarget(-Math.abs(this.tvx) || -this.speedBase, this.tvy);
    if (this.y < MARGIN)             this.setTarget(this.tvx,  Math.abs(this.tvy) || this.speedBase * 0.4);
    if (this.y > H * 0.82)           this.setTarget(this.tvx, -Math.abs(this.tvy) || -this.speedBase * 0.4);
  }

  update(dt) {
    const foodIdx = this.targetFood();

    if (foodIdx >= 0) {
      // к еде — едем в её сторону на повышенной скорости
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
      // синусоида по X, мягкое покачивание по Y
      this.dir = this.x < MARGIN ? 1 : (this.x > W - MARGIN ? -1 : this.dir);
      this.phase += dt * 1.6;
      this.setTarget(this.dir * this.speedBase, Math.cos(this.phase) * this.speedBase * 0.6);
    } else if (this.pattern === "circle") {
      // движение по кругу с медленным дрейфом центра
      this.circleAngle += this.angularSpeed * dt;
      this.cx += Math.cos(performance.now() * 0.00007 + this.id.length) * 6 * dt;
      this.cy += Math.sin(performance.now() * 0.00005) * 4 * dt;
      this.cx = Math.min(Math.max(this.cx, this.radius + 40), W - this.radius - 40);
      this.cy = Math.min(Math.max(this.cy, this.radius + 40), H * 0.8 - this.radius);
      // целевой вектор — касательная к окружности
      const tx = -Math.sin(this.circleAngle) * this.angularSpeed;
      const ty =  Math.cos(this.circleAngle) * this.angularSpeed * 0.6;
      this.setTarget(tx * this.speedBase, ty * this.speedBase);
    } else if (this.pattern === "free") {
      // свободное движение в любом направлении: иногда меняем курс плавно
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
      // классический wander
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
    // лёгкое «дыхание» корпуса при плавании
    const wiggle = reducedMotion ? 0 : Math.sin(t * 0.006 + this.x * 0.01) * 0.06;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Спрайт нарисован головой влево (-X). Всегда отражаем по X,
    // чтобы голова смотрела в +X (вперёд по движению). При движении
    // влево (facing<0) rotate(π) переворачивает спину вниз —
    // компенсируем отражением по Y.
    ctx.scale(-1, this.facing >= 0 ? 1 : -1);
    // наклон от wiggle добавляем, только если он смотрит вперёд
    ctx.rotate(wiggle * this.facing);
    ctx.drawImage(this.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// Animated 3D Fish — FBX model + scanned texture + animation
// ---------------------------------------------------------------

const fish3d = [];

class AnimatedFish3D {
  constructor(data) {
    this.id = data.id;
    this.pattern = data.pattern || "free";
    this.speedBase = 55 * (data.speed || 1);
    this.scaleMul = data.scale || 1;
    this.fbxUrl = data.fbx_url;
    this.textureImage = data.image; // base64 data URL

    // Movement state — same as 2D Fish
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

    // 3D state
    this.group = new THREE.Group();
    this.group.visible = false; // hidden until loaded
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

      // Apply the scanned texture to all mesh materials
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
          // Handle both single material and material array
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

      // Play skeleton animation if present
      if (model.animations && model.animations.length > 0) {
        this.animationMixer = new THREE.AnimationMixer(model);
        this.animationAction = this.animationMixer.clipAction(model.animations[0]);
        this.animationAction.play();
      }

      // Scale: FBX from Blender is in meters; fish should be ~120px tall on screen
      const targetHeight = 120 * this.scaleMul;
      const box = new THREE.Box3().setFromObject(model);
      const modelH = box.max.y - box.min.y || 1;
      const s = targetHeight / modelH;
      model.scale.set(s, s, s);

      // Rotate model so it faces +X (right) on screen.
      // Blender FBX: fish faces -Y in local space. Rotate 90° around Z → faces +X.
      model.rotation.z = Math.PI / 2;

      this.group.add(model);
      this.group.visible = true;
      this.ready = true;
      this._syncPosition();
    } catch (err) {
      console.warn("Failed to load 3D model for fish", this.id, err);
      this.dead = true;
      scene3d.remove(this.group);
    }
  }

  _syncPosition() {
    // Flip Y: 2D canvas has Y down, but Three.js camera has Y up
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

    // Update animation mixer
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

  // Update & draw 2D fish
  for (const f of fish) { f.update(dt); f.draw(t); }

  // Update 3D fish (skip dead ones that failed to load)
  for (const f of fish3d) { if (!f.dead) f.update(dt); }

  // Render 3D scene on top (transparent background, only fish visible)
  renderer3d.render(scene3d, camera3d);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
