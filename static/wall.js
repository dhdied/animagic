const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const statusDot = document.getElementById("statusDot");
const hint = document.getElementById("hint");
const emptyMsg = document.getElementById("emptyMsg");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let W = 0, H = 0;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
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
// Fish
// ---------------------------------------------------------------
const EAT_RADIUS = 34;
const ATTRACT_RADIUS = 420;
const fish = [];

class Fish {
  constructor(data) {
    this.id = data.id;
    this.pattern = data.pattern || "sine";
    this.speed = 55 * (data.speed || 1);
    this.scaleMul = data.scale || 1;
    this.img = new Image();
    this.img.src = data.image;
    this.ready = false;
    this.img.onload = () => { this.ready = true; };

    this.x = Math.random() * W * 0.6 + W * 0.2;
    this.y = Math.random() * H * 0.5 + H * 0.15;
    this.angle = Math.random() * Math.PI * 2;
    this.facing = 1;
    this.pulse = 0;

    // sine
    this.baseY = this.y;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * Math.PI * 2;

    // circle
    this.cx = this.x;
    this.cy = this.y;
    this.radius = 60 + Math.random() * 90;
    this.angularSpeed = (0.4 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);

    // wander
    this.wanderAngle = Math.random() * Math.PI * 2;

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

  update(dt) {
    const foodIdx = this.targetFood();

    if (foodIdx >= 0) {
      const f = foods[foodIdx];
      const dx = f.x - this.x, dy = (f.y + f.sink) - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const vx = (dx / dist) * this.speed * 1.6;
      const vy = (dy / dist) * this.speed * 1.6;
      this.x += vx * dt;
      this.y += vy * dt;
      this.facing = dx >= 0 ? 1 : -1;
      // keep pattern state roughly in sync so behaviour resumes smoothly
      this.baseY = this.y;
      this.cx = this.x; this.cy = this.y;
      this.wanderAngle = Math.atan2(dy, dx);

      if (dist < EAT_RADIUS) {
        foods.splice(foodIdx, 1);
        this.pulse = 1;
      }
    } else if (this.pattern === "sine") {
      this.phase += dt * 1.6;
      this.x += this.dir * this.speed * dt;
      this.y = this.baseY + Math.sin(this.phase) * 26;
      this.facing = this.dir;
      if (this.x < 60) { this.dir = 1; this.x = 60; }
      if (this.x > W - 60) { this.dir = -1; this.x = W - 60; }
      if (this.y < 60) this.baseY = 60;
      if (this.y > H * 0.82) this.baseY = H * 0.82;
    } else if (this.pattern === "circle") {
      this.cx += Math.cos(performance.now() * 0.00007 + this.id.length) * 6 * dt;
      this.cy += Math.sin(performance.now() * 0.00005) * 4 * dt;
      this.cx = Math.min(Math.max(this.cx, this.radius + 40), W - this.radius - 40);
      this.cy = Math.min(Math.max(this.cy, this.radius + 40), H * 0.8 - this.radius);
      this.angle += this.angularSpeed * dt;
      this.x = this.cx + Math.cos(this.angle) * this.radius;
      this.y = this.cy + Math.sin(this.angle) * this.radius * 0.6;
      const tangentX = -Math.sin(this.angle) * this.angularSpeed;
      this.facing = tangentX >= 0 ? 1 : -1;
    } else {
      // wander
      this.wanderAngle += (Math.random() - 0.5) * 1.4 * dt;
      const vx = Math.cos(this.wanderAngle) * this.speed;
      const vy = Math.sin(this.wanderAngle) * this.speed;
      this.x += vx * dt;
      this.y += vy * dt;
      this.facing = vx >= 0 ? 1 : -1;
      const margin = 60;
      if (this.x < margin) { this.wanderAngle = 0; }
      if (this.x > W - margin) { this.wanderAngle = Math.PI; }
      if (this.y < margin) { this.wanderAngle = Math.PI / 2; }
      if (this.y > H * 0.82) { this.wanderAngle = -Math.PI / 2; }
    }

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
    ctx.rotate(wiggle);
    ctx.scale(this.facing >= 0 ? 1 : -1, 1);
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
    if (msg.type === "new_fish") {
      emptyMsg.style.display = "none";
      fish.push(new Fish(msg));
    }
  };
}
connectWS();

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

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
