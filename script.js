const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const bestScoreEl = document.querySelector("#bestScore");
const comboEl = document.querySelector("#combo");
const progressBar = document.querySelector("#progressBar");
const progressLabel = document.querySelector("#progressLabel");
const leaderboardList = document.querySelector("#leaderboardList");
const scoreDialog = document.querySelector("#scoreDialog");
const finalScoreText = document.querySelector("#finalScoreText");
const playerNameInput = document.querySelector("#playerNameInput");
const saveScoreButton = document.querySelector("#saveScoreButton");
const startPanel = document.querySelector("#startPanel");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const restartButton = document.querySelector("#restartButton");
const touchPause = document.querySelector("#touchPause");
const moveButtons = document.querySelectorAll("[data-move]");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = new Set();
const leaderboardKey = "od-catcher-leaderboard";
const SUPABASE_URL = "https://afzajceejxvqksrgrzvj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_W0ZkOmwnIj0vzGUazDn0Rw_IFboFy0m";
const onlineLeaderboard =
  SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

let leaderboard = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
let bestScore = Number(localStorage.getItem("od-catcher-best") || 0);
let running = false;
let paused = false;
let lastTime = 0;
let spawnTimer = 0;
let driftTimer = 0;

const state = {
  score: 0,
  level: 1,
  lives: 3,
  combo: 0,
  player: {
    x: WIDTH / 2,
    y: HEIGHT - 72,
    width: 76,
    height: 42,
    speed: 440,
  },
  drops: [],
  sparks: [],
  stars: [],
};

function resetGame() {
  state.score = 0;
  state.level = 1;
  state.lives = 3;
  state.combo = 0;
  state.player.x = WIDTH / 2;
  state.drops = [];
  state.sparks = [];
  spawnTimer = 0;
  driftTimer = 0;
  paused = false;
  pauseButton.textContent = "Pause";
  updateHud();
}

function updateHud() {
  scoreEl.textContent = state.score;
  levelEl.textContent = state.level;
  livesEl.textContent = state.lives;
  comboEl.textContent = state.combo;
  bestScoreEl.textContent = bestScore;

  const nextLevel = state.level * 10;
  const previousLevel = (state.level - 1) * 10;
  const progress = (state.score - previousLevel) / (nextLevel - previousLevel);
  progressBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  progressLabel.textContent = `Дараагийн level: ${Math.max(0, nextLevel - state.score)}`;
}

function renderLeaderboard() {
  leaderboardList.innerHTML = "";

  if (leaderboard.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Одоогоор оноо алга";
    leaderboardList.append(empty);
    return;
  }

  for (const entry of leaderboard.slice(0, 5)) {
    const item = document.createElement("li");
    item.textContent = `${entry.name} - ${entry.score}`;
    leaderboardList.append(item);
  }
}

async function loadLeaderboard() {
  if (!onlineLeaderboard) {
    renderLeaderboard();
    return;
  }

  const { data, error } = await onlineLeaderboard
    .from("scores")
    .select("name, score")
    .order("score", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Leaderboard load failed:", error.message);
    renderLeaderboard();
    return;
  }

  leaderboard = data || [];
  renderLeaderboard();
}

async function saveLeaderboardScore(name, score) {
  if (onlineLeaderboard) {
    const { error } = await onlineLeaderboard.from("scores").insert({ name, score });
    if (error) {
      console.error("Leaderboard save failed:", error.message);
    }
    await loadLeaderboard();
    return;
  }

  leaderboard.push({ name, score });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 5);
  localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard));
  renderLeaderboard();
}

function openScoreDialog() {
  finalScoreText.textContent = `Чиний оноо: ${state.score}`;
  scoreDialog.hidden = false;
  playerNameInput.focus();
  playerNameInput.select();
}

async function closeScoreDialog() {
  const name = playerNameInput.value.trim().slice(0, 16) || "Player";
  await saveLeaderboardScore(name, state.score);
  scoreDialog.hidden = true;
}

function createBackdrop() {
  state.stars = Array.from({ length: 80 }, () => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    r: Math.random() * 1.8 + 0.4,
    speed: Math.random() * 18 + 8,
    alpha: Math.random() * 0.55 + 0.2,
  }));
}

function spawnDrop() {
  const isMeteor = Math.random() < Math.min(0.32 + state.level * 0.025, 0.58);
  const size = isMeteor ? random(28, 48) : random(22, 34);
  state.drops.push({
    x: random(40, WIDTH - 40),
    y: -50,
    size,
    type: isMeteor ? "meteor" : "star",
    speed: random(120, 180) + state.level * 24,
    spin: random(-2.2, 2.2),
    angle: random(0, Math.PI * 2),
  });
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function update(delta) {
  if (!running || paused) {
    return;
  }

  const direction = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);

  state.player.x = clamp(
    state.player.x + direction * state.player.speed * delta,
    state.player.width / 2 + 12,
    WIDTH - state.player.width / 2 - 12,
  );

  driftTimer += delta;
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnDrop();
    spawnTimer = Math.max(0.32, 0.86 - state.level * 0.055);
  }

  for (const star of state.stars) {
    star.y += star.speed * delta;
    if (star.y > HEIGHT) {
      star.y = -4;
      star.x = Math.random() * WIDTH;
    }
  }

  for (const drop of state.drops) {
    drop.y += drop.speed * delta;
    drop.x += Math.sin(driftTimer * 2 + drop.angle) * 28 * delta;
    drop.angle += drop.spin * delta;
  }

  checkCollisions();
  state.drops = state.drops.filter((drop) => drop.y < HEIGHT + 70);
  state.sparks = state.sparks.filter((spark) => {
    spark.life -= delta;
    spark.x += spark.vx * delta;
    spark.y += spark.vy * delta;
    spark.vy += 150 * delta;
    return spark.life > 0;
  });
}

function checkCollisions() {
  const player = state.player;
  const px = player.x;
  const py = player.y;

  for (const drop of state.drops) {
    if (drop.hit) {
      continue;
    }

    const dx = drop.x - px;
    const dy = drop.y - py;
    const distance = Math.hypot(dx, dy);
    const radius = drop.size * 0.55 + player.width * 0.34;

    if (distance < radius) {
      drop.hit = true;
      burst(drop.x, drop.y, drop.type);

      if (drop.type === "star") {
        state.combo += 1;
        state.score += 1 + Math.floor(state.combo / 5);
        state.level = Math.floor(state.score / 10) + 1;
      } else {
        state.combo = 0;
        state.lives -= 1;
        if (state.lives <= 0) {
          endGame();
        }
      }
      updateHud();
    }
  }
}

function burst(x, y, type) {
  const color = type === "star" ? "#f3b942" : "#e65d43";
  for (let i = 0; i < 14; i += 1) {
    const angle = random(0, Math.PI * 2);
    const speed = random(70, 190);
    state.sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.28, 0.7),
      color,
    });
  }
}

function endGame() {
  running = false;
  paused = false;
  bestScore = Math.max(bestScore, state.score);
  localStorage.setItem("od-catcher-best", String(bestScore));
  updateHud();
  startButton.textContent = "Again";
  startPanel.querySelector("p:not(.kicker)").textContent =
    `Тоглоом дууслаа. Чиний оноо: ${state.score}.`;
  startPanel.classList.remove("is-hidden");
  openScoreDialog();
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawSky();
  drawDrops();
  drawPlayer();
  drawSparks();

  if (paused && running) {
    drawPause();
  }
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#09110f");
  gradient.addColorStop(0.46, "#14231c");
  gradient.addColorStop(1, "#3a2117");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(58, 167, 155, 0.18)";
  ctx.beginPath();
  ctx.arc(WIDTH * 0.78, HEIGHT * 0.18, 150, 0, Math.PI * 2);
  ctx.fill();

  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255, 244, 214, 0.08)";
  ctx.fillRect(0, HEIGHT - 36, WIDTH, 36);
}

function drawDrops() {
  for (const drop of state.drops) {
    if (drop.hit) {
      continue;
    }
    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.rotate(drop.angle);
    if (drop.type === "star") {
      drawStar(drop.size);
    } else {
      drawMeteor(drop.size);
    }
    ctx.restore();
  }
}

function drawStar(size) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? size * 0.56 : size * 0.24;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = "#f3b942";
  ctx.shadowColor = "rgba(243, 185, 66, 0.8)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 244, 214, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMeteor(size) {
  ctx.fillStyle = "rgba(230, 93, 67, 0.22)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.5, 0, size * 0.8, size * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e65d43";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8d3228";
  ctx.beginPath();
  ctx.arc(size * 0.12, -size * 0.06, size * 0.1, 0, Math.PI * 2);
  ctx.arc(-size * 0.15, size * 0.12, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer() {
  const { x, y, width, height } = state.player;
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(58, 167, 155, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, height * 0.7, width * 0.55, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff4d6";
  ctx.beginPath();
  ctx.moveTo(0, -height * 0.7);
  ctx.lineTo(width * 0.48, height * 0.35);
  ctx.lineTo(width * 0.18, height * 0.18);
  ctx.lineTo(0, height * 0.66);
  ctx.lineTo(-width * 0.18, height * 0.18);
  ctx.lineTo(-width * 0.48, height * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3aa79b";
  ctx.beginPath();
  ctx.arc(0, -height * 0.12, height * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e65d43";
  ctx.fillRect(-width * 0.12, height * 0.36, width * 0.24, height * 0.24);
  ctx.restore();
}

function drawSparks() {
  for (const spark of state.sparks) {
    ctx.globalAlpha = Math.max(0, spark.life * 1.8);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPause() {
  ctx.fillStyle = "rgba(16, 21, 16, 0.58)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#fff4d6";
  ctx.font = "900 54px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2);
}

function loop(time) {
  const delta = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(delta);
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  resetGame();
  running = true;
  startButton.textContent = "Start";
  startPanel.querySelector("p:not(.kicker)").textContent =
    "Унаж буй оддыг цуглуулаад солируудаас бултаарай.";
  startPanel.classList.add("is-hidden");
}

function togglePause() {
  if (!running) {
    return;
  }
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
touchPause.addEventListener("click", togglePause);
saveScoreButton.addEventListener("click", closeScoreDialog);

playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    closeScoreDialog();
  }
});

window.addEventListener("keydown", (event) => {
  keys.add(event.key);
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (running) {
      togglePause();
    } else {
      startGame();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

for (const button of moveButtons) {
  const value = button.dataset.move === "1" ? "ArrowRight" : "ArrowLeft";
  button.addEventListener("pointerdown", () => keys.add(value));
  button.addEventListener("pointerup", () => keys.delete(value));
  button.addEventListener("pointercancel", () => keys.delete(value));
  button.addEventListener("pointerleave", () => keys.delete(value));
}

createBackdrop();
updateHud();
loadLeaderboard();
requestAnimationFrame(loop);
