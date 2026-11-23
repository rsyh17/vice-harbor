// Vice Harbor: an original top-down open-world crime game in one module.
// A whole city on foot and by car: traffic, pedestrians, stealable cars, a
// five-star wanted system with police chases, fists and a pistol, a five-job
// story for fixer Dewi, a HUD with a live minimap, and a localStorage save.
// No libraries, no network: plain canvas 2D, keyboard and mouse free.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mm = minimap.getContext('2d');
let VW = 0, VH = 0;
function resize() {
  VW = canvas.width = window.innerWidth;
  VH = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- utilities

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
let seed = Number(params.get('seed') ?? (SHOT ? 1 : (Date.now() % 100000)));
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// ---------------------------------------------------------------- the city

const WORLD = 2600; // the city is WORLD x WORLD px
const ROAD_EVERY = 340; // a road centre every 340 px
const ROAD_W = 96; // road width
const WATER_X = 2290; // the sea starts here, down the east edge
const roads = [];
for (let p = 170; p < WORLD - 100; p += ROAD_EVERY) roads.push(p);

const BUILDING_COLORS = ['#8d6e63', '#78909c', '#a1887f', '#90a4ae', '#bcaaa4', '#6d8ea0', '#c0a062', '#7e57c2', '#4f7f8f', '#9c6644'];
const ROOF_COLORS = ['#5d4037', '#455a64', '#6d4c41', '#37474f', '#795548', '#546e7a', '#8a6d3b', '#4527a0'];
const PLACE_NAMES = ['Hotel Marlin', 'Karaoke Luna', 'Bank Nusantara', 'Sate House', 'Mall Pelangi', 'Klinik Sehat', 'Bengkel Jaya', 'Kopi Senja', 'Apotek Vita', 'Toko Beras', 'Hotel Ombak', 'Ruko Emas', 'Cafe Pelabuhan', 'Gym Besi', 'Pasar Baru', 'Kantor Pos', 'Bar Ombak', 'Studio Foto', 'Toko Roti', 'Laundry Kilat'];

const buildings = [];
const trees = [];
const lamps = [];
function buildCity() {
  let nameIdx = 0;
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = bx * ROAD_EVERY + ROAD_W / 2 + 14;
      const y0 = by * ROAD_EVERY + ROAD_W / 2 + 14;
      const size = ROAD_EVERY - ROAD_W - 28;
      if (bx === 6) continue; // the beach strip stays open
      if ((bx === 2 && by === 2) || (bx === 4 && by === 5)) {
        // a park block: grass and trees, no buildings
        for (let t = 0; t < 14; t++) trees.push({ x: x0 + rr(16, size - 16), y: y0 + rr(16, size - 16), park: true });
        continue;
      }
      const n = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const w = rr(62, 118);
        const h = rr(62, 118);
        const x = x0 + rr(0, size - w);
        const y = y0 + rr(0, size - h);
        if (buildings.some((b) => x < b.x + b.w + 10 && x + w + 10 > b.x && y < b.y + b.h + 10 && y + h + 10 > b.y)) continue;
        buildings.push({ x, y, w, h, color: pick(BUILDING_COLORS), roof: pick(ROOF_COLORS), name: rand() < 0.3 ? PLACE_NAMES[nameIdx++ % PLACE_NAMES.length] : null });
      }
    }
  }
  for (let y = 60; y < WORLD - 60; y += 130) trees.push({ x: WATER_X - rr(26, 60), y, park: false }); // palms on the beach
  for (const rx of roads) for (const ry of roads) lamps.push({ x: rx + ROAD_W / 2 + 6, y: ry + ROAD_W / 2 + 6 });
}
buildCity();

function collideBuildings(x, y, rad) {
  // push a circle at (x, y) out of every building; returns the corrected point
  for (const b of buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const d2 = (x - nx) ** 2 + (y - ny) ** 2;
    if (d2 < rad * rad) {
      if (d2 === 0) {
        y = b.y - rad;
        continue;
      }
      const d = Math.sqrt(d2);
      x = nx + ((x - nx) / d) * rad;
      y = ny + ((y - ny) / d) * rad;
    }
  }
  return [x, y];
}
const inWater = (x) => x > WATER_X + 90;

// ---------------------------------------------------------------- audio

let AC = null;
function audio() {
  if (AC === null) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      AC = null;
    }
  }
  return AC;
}
function beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
  const ac = audio();
  if (ac === null) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  if (slide !== 0) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + dur);
}
function noise(dur, vol = 0.12, freq = 900) {
  const ac = audio();
  if (ac === null) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination);
  src.start();
}
const sfx = {
  punch: () => noise(0.08, 0.15, 500),
  shot: () => noise(0.16, 0.22, 1400),
  pickup: () => { beep(660, 0.08, 'square', 0.05); setTimeout(() => beep(990, 0.1, 'square', 0.05), 70); },
  cash: () => { beep(880, 0.07, 'triangle', 0.06); setTimeout(() => beep(1320, 0.12, 'triangle', 0.06), 60); },
  crash: () => noise(0.2, 0.18, 700),
  door: () => beep(180, 0.07, 'sine', 0.08, -60),
  mission: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.06), i * 110)); },
  fail: () => { beep(220, 0.25, 'sawtooth', 0.06, -120); },
};

// ---------------------------------------------------------------- game state

const CAR_COLORS = ['#d64541', '#3f7fbf', '#e8c33a', '#e8e8e8', '#2e2e38', '#53a06b', '#c96a26', '#8e44ad', '#16a3a3', '#d9d9d9'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ecf0f1', '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8', '#95a5a6'];

const G = {
  mode: 'menu', // menu | play | over | pause | end
  time: 0,
  money: 120,
  health: 100,
  wanted: 0, // 0..5 stars
  heat: 0, // builds toward the next star, decays when unseen
  bustMeter: 0,
  hasGun: false,
  ammo: 0,
  mission: 0, // index into MISSIONS; MISSIONS.length = story done
  missionState: null,
  kills: 0,
  stolen: 0,
  startedAt: Date.now(),
};

const player = { x: 420, y: 420, angle: 0, speed: 0, car: null, punchAt: 0, shotAt: 0, radius: 13 };
const cars = [];
const peds = [];
const pickups = [];
const bullets = [];
let camX = 0, camY = 0;

function makeCar(x, y, angle, kind) {
  const car = { x, y, angle, speed: 0, color: kind === 'police' ? '#20304a' : pick(CAR_COLORS), kind, health: 100, driver: null, targetX: x, targetY: y, turnAt: 0, honkAt: 0, dead: false };
  cars.push(car);
  return car;
}
function makePed(x, y) {
  const ped = { x, y, angle: rr(0, Math.PI * 2), speed: 0, color: pick(PED_COLORS), state: 'walk', tx: x, ty: y, health: 30, panicAt: 0, dead: false, cash: Math.floor(rr(4, 40)) };
  peds.push(ped);
  return ped;
}

function nearestRoadPoint(x, y) {
  let best = null, bd = 1e18;
  for (const rx of roads) for (const ry of roads) {
    const d = dist2(x, y, rx, ry);
    if (d < bd) { bd = d; best = { x: rx, y: ry }; }
  }
  return best;
}

function spawnWorld() {
  // parked cars along the roads and a few in blocks
  for (let i = 0; i < 26; i++) {
    const rx = pick(roads) + (rand() < 0.5 ? -ROAD_W / 2 + 14 : ROAD_W / 2 - 14);
    const ry = rr(80, WORLD - 200);
    const [x, y] = collideBuildings(rx, ry, 20);
    if (!inWater(x)) makeCar(x, y, Math.PI / 2, 'parked');
  }
  // moving traffic
  for (let i = 0; i < 16; i++) {
    const vert = rand() < 0.5;
    const lane = pick(roads) + (vert ? 22 : 22);
    const car = makeCar(vert ? lane : rr(60, WORLD - 300), vert ? rr(60, WORLD - 300) : lane, vert ? (rand() < 0.5 ? 0 : Math.PI) : (rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
    car.driver = makePed(car.x, car.y);
    car.driver.state = 'drive';
    car.cruise = rr(2.2, 3.4);
  }
  // pedestrians on the sidewalks
  for (let i = 0; i < 42; i++) {
    const rx = pick(roads) + rr(-ROAD_W / 2 - 16, ROAD_W / 2 + 16);
    const ry = rr(60, WORLD - 260);
    const [x, y] = collideBuildings(rx, ry, 12);
    if (!inWater(x)) makePed(x, y);
  }
  // a pistol and ammo in the alley by the market, health at the clinic block
  pickups.push({ x: 2 * ROAD_EVERY + 90, y: 2 * ROAD_EVERY + 210, kind: 'gun', taken: false });
  for (let i = 0; i < 5; i++) pickups.push({ x: rr(200, 2100), y: rr(200, 2200), kind: 'ammo', taken: false });
  pickups.push({ x: 3 * ROAD_EVERY + 120, y: 4 * ROAD_EVERY + 120, kind: 'health', taken: false });
  pickups.push({ x: 5 * ROAD_EVERY + 80, y: 1 * ROAD_EVERY + 160, kind: 'health', taken: false });
}

// ---------------------------------------------------------------- missions

// A job is a list of stages; each stage has a target point (or a car to fetch)
// and the text Dewi shows. Reaching the marker advances the stage.
const GARAGE = { x: 1 * ROAD_EVERY + 40, y: 5 * ROAD_EVERY + 60 };
const HARBOR = { x: WATER_X - 60, y: 3 * ROAD_EVERY };
const MISSIONS = [
  {
    name: 'Job 1 — First Wheels',
    pay: 300,
    intro: 'Dewi: "A blue sedan is parked by the Marlin hotel, keys in. Take it and bring it to my garage, south-west."',
    stages: [{ text: 'Get into the marked sedan', point: null, needCar: 'marked' }, { text: 'Deliver the sedan to Dewi\'s garage', point: GARAGE, inCar: true }],
  },
  {
    name: 'Job 2 — Hot Package',
    pay: 600,
    intro: 'Dewi: "Pick up the package at the market and drop it at the harbor office. The clock is ticking and the police will care."',
    stages: [{ text: 'Pick up the package at Pasar Baru', point: { x: 2 * ROAD_EVERY + 150, y: 3 * ROAD_EVERY + 90 } }, { text: 'Deliver it to the harbor office — hurry!', point: { x: WATER_X - 140, y: 2 * ROAD_EVERY + 40 }, timer: 90, wanted: 2 }],
  },
  {
    name: 'Job 3 — Repo Job',
    pay: 900,
    intro: 'Dewi: "A gambler owes me a sports car. Stop him, take it, bring it home. He will not stop politely."',
    stages: [{ text: 'Stop the fleeing sports car and take it', point: null, needCar: 'repo' }, { text: 'Bring the sports car to the garage', point: GARAGE, inCar: true }],
  },
  {
    name: 'Job 4 — Three Drops',
    pay: 1500,
    intro: 'Dewi: "Three briefcases, three corners of the city. The whole force will be watching. Collect them all."',
    stages: [{ text: 'Collect briefcase 1 of 3', point: { x: 5 * ROAD_EVERY + 120, y: 0 * ROAD_EVERY + 200 }, wanted: 3 }, { text: 'Collect briefcase 2 of 3', point: { x: 0 * ROAD_EVERY + 210, y: 4 * ROAD_EVERY + 130 }, wanted: 3 }, { text: 'Collect briefcase 3 of 3', point: { x: 4 * ROAD_EVERY + 90, y: 6 * ROAD_EVERY - 60 }, wanted: 3 }, { text: 'Bring the briefcases to the garage', point: GARAGE, wanted: 2 }],
  },
  {
    name: 'Job 5 — Harbor Run',
    pay: 3000,
    intro: 'Dewi: "Last one, Rafi. A boat waits at the harbor with your name on it. Every cop in the city knows. Run."',
    stages: [{ text: 'Reach the boat at the harbor!', point: HARBOR, timer: 120, wanted: 4 }],
  },
];

let markedCar = null;
function startMission(idx) {
  const m = MISSIONS[idx];
  if (!m) return;
  G.missionState = { stage: 0, timer: null, failed: false };
  showBanner(`${m.name}\n${m.intro}`, 7000);
  const st = m.stages[0];
  if (st.needCar === 'marked') {
    markedCar = makeCar(1 * ROAD_EVERY + 130, 0 * ROAD_EVERY + 130, Math.PI / 2, 'marked');
    markedCar.color = '#3f7fbf';
  }
  if (st.needCar === 'repo') spawnRepoCar();
  if (st.wanted) setWanted(st.wanted);
  if (st.timer) G.missionState.timer = st.timer;
}
function spawnRepoCar() {
  markedCar = makeCar(4 * ROAD_EVERY, 2 * ROAD_EVERY, 0, 'repo');
  markedCar.color = '#e8c33a';
  markedCar.cruise = 3.6;
  markedCar.driver = makePed(markedCar.x, markedCar.y);
  markedCar.driver.state = 'drive';
}
function currentStage() {
  const m = MISSIONS[G.mission];
  if (!m || !G.missionState) return null;
  return m.stages[G.missionState.stage] ?? null;
}
function stagePoint() {
  const st = currentStage();
  if (!st) return null;
  if (st.needCar) return markedCar && !markedCar.dead ? { x: markedCar.x, y: markedCar.y } : null;
  return st.point;
}
function advanceStage() {
  const m = MISSIONS[G.mission];
  const ms = G.missionState;
  ms.stage++;
  if (ms.stage >= m.stages.length) {
    G.money += m.pay;
    sfx.mission();
    showToast(`${m.name} complete — $${m.pay} earned`);
    G.mission++;
    G.missionState = null;
    markedCar = null;
    saveGame();
    if (G.mission >= MISSIONS.length) {
      setTimeout(() => endStory(), 1600);
    } else {
      setTimeout(() => startMission(G.mission), 2600);
    }
    return;
  }
  const st = m.stages[ms.stage];
  showBanner(st.text, 4200);
  if (st.needCar === 'repo') spawnRepoCar();
  if (st.wanted) setWanted(st.wanted);
  ms.timer = st.timer ?? null;
}
function failMission(reason) {
  sfx.fail();
  showBanner(`Job failed: ${reason}. Dewi sends you back to try again.`, 4200);
  G.missionState = null;
  markedCar = null;
  setTimeout(() => startMission(G.mission), 2200);
}

// ---------------------------------------------------------------- wanted

function setWanted(n) {
  G.wanted = clamp(Math.max(G.wanted, n), 0, 5);
}
function addCrime(amount) {
  G.heat += amount;
  while (G.heat >= 1 && G.wanted < 5) {
    G.wanted++;
    G.heat -= 1;
  }
  if (G.wanted >= 5) G.heat = Math.min(G.heat, 0.99);
}

// ---------------------------------------------------------------- input

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  if (G.mode === 'play') {
    if (e.key.toLowerCase() === 'e') tryEnterExit();
    if (e.key.toLowerCase() === 'p') pauseGame();
  } else if (G.mode === 'pause' && e.key.toLowerCase() === 'p') resumeGame();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
const down = (...ks) => ks.some((k) => keys[k]);

// ---------------------------------------------------------------- interaction

function tryEnterExit() {
  if (player.car) {
    const car = player.car;
    player.car = null;
    car.driver = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    [player.x, player.y] = collideBuildings(player.x, player.y, player.radius);
    sfx.door();
    return;
  }
  let best = null, bd = 52 * 52;
  for (const car of cars) {
    if (car.dead) continue;
    const d = dist2(player.x, player.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (best) {
    if (best.driver) {
      // yank the driver out: a crime the street notices
      best.driver.state = 'flee';
      best.driver.x = best.x + 24;
      best.driver.y = best.y + 10;
      best.driver = null;
      addCrime(0.45);
      G.stolen++;
    }
    if (best.kind === 'parked' || best.kind === 'marked') G.stolen += best.kind === 'parked' ? 0 : 0; // marked cars are the job
    player.car = best;
    best.driver = 'player';
    sfx.door();
  }
}

function punch() {
  const now = G.time;
  if (now - player.punchAt < 0.32) return;
  player.punchAt = now;
  sfx.punch();
  const fx = player.x + Math.cos(player.angle) * 24;
  const fy = player.y + Math.sin(player.angle) * 24;
  for (const ped of peds) {
    if (ped.dead || ped.state === 'drive') continue;
    if (dist2(fx, fy, ped.x, ped.y) < 30 * 30) {
      ped.health -= 16;
      ped.state = 'flee';
      ped.panicAt = now + 3;
      addCrime(0.3);
      if (ped.health <= 0 && !ped.dead) {
        ped.dead = true;
        G.kills++;
        addCrime(0.7);
        G.money += ped.cash;
        showToast(`Took $${ped.cash} off a very sorry pedestrian`);
        sfx.cash();
      }
    }
  }
  for (const car of cars) {
    if (!car.dead && dist2(fx, fy, car.x, car.y) < 34 * 34) {
      car.health -= 5;
      if (car.driver && car.driver !== 'player') addCrime(0.2);
    }
  }
}

function shoot() {
  const now = G.time;
  if (!G.hasGun || G.ammo <= 0 || now - player.shotAt < 0.24) return;
  player.shotAt = now;
  G.ammo--;
  sfx.shot();
  addCrime(0.35);
  bullets.push({ x: player.x + Math.cos(player.angle) * 18, y: player.y + Math.sin(player.angle) * 18, angle: player.angle + rr(-0.03, 0.03), life: 0.5 });
  const bx = player.x + Math.cos(player.angle) * 190;
  const by = player.y + Math.sin(player.angle) * 190;
  // hitscan along the facing line: nearest ped or car within the corridor
  let victim = null, vd = 1e18;
  for (const ped of peds) {
    if (ped.dead || ped.state === 'drive') continue;
    const t = (ped.x - player.x) * Math.cos(player.angle) + (ped.y - player.y) * Math.sin(player.angle);
    if (t < 0 || t > 200) continue;
    const perp = Math.abs((ped.x - player.x) * Math.sin(player.angle) - (ped.y - player.y) * Math.cos(player.angle));
    if (perp < 15 && t < vd) { vd = t; victim = ped; }
  }
  if (victim) {
    victim.health -= 34;
    victim.state = 'flee';
    victim.panicAt = now + 4;
    if (victim.health <= 0 && !victim.dead) {
      victim.dead = true;
      G.kills++;
      addCrime(0.8);
      G.money += victim.cash;
      sfx.cash();
    }
    return;
  }
  for (const car of cars) {
    if (car.dead) continue;
    if (dist2(bx, by, car.x, car.y) < 42 * 42 || dist2(player.x, player.y, car.x, car.y) < 200 * 200 && Math.abs(angDiff(Math.atan2(car.y - player.y, car.x - player.x), player.angle)) < 0.1) {
      car.health -= 22;
      if (car.health <= 0) car.dead = true;
    }
  }
}

// ---------------------------------------------------------------- updates

function updatePlayer(dt) {
  const run = down('shift') ? 1.55 : 1;
  if (player.car) {
    const car = player.car;
    const accel = down('w', 'arrowup') ? 0.16 : down('s', 'arrowdown') ? (car.speed > 0.4 ? -0.3 : -0.09) : 0;
    car.speed += accel;
    car.speed *= down(' ') ? 0.94 : 0.985;
    car.speed = clamp(car.speed, -2.6, car.kind === 'repo' || car.kind === 'marked' ? 7.4 : 6.4);
    const steer = (down('a', 'arrowleft') ? -1 : 0) + (down('d', 'arrowright') ? 1 : 0);
    if (Math.abs(car.speed) > 0.05) car.angle += steer * 0.032 * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 2.4);
    moveCar(car, dt, true);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (Math.abs(car.speed) > 3.4 && rand() < 0.3) addCrime(0.004); // reckless driving is noticed, slowly
  } else {
    let mx = (down('a', 'arrowleft') ? -1 : 0) + (down('d', 'arrowright') ? 1 : 0);
    let my = (down('w', 'arrowup') ? -1 : 0) + (down('s', 'arrowdown') ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      const sp = 2.35 * run;
      player.x += (mx / len) * sp;
      player.y += (my / len) * sp;
      player.angle = Math.atan2(my, mx);
      [player.x, player.y] = collideBuildings(player.x, player.y, player.radius);
      player.x = clamp(player.x, 14, WORLD - 14);
      player.y = clamp(player.y, 14, WORLD - 14);
      if (inWater(player.x)) player.x = WATER_X + 88;
    }
    if (down('j')) punch();
    if (down('k')) shoot();
  }
}

function moveCar(car, dt, isPlayer = false) {
  const nx = car.x + Math.cos(car.angle) * car.speed;
  const ny = car.y + Math.sin(car.angle) * car.speed;
  let [x, y] = collideBuildings(nx, ny, 21);
  if (inWater(x)) x = car.x;
  // hitting a building or another car costs speed and bodywork
  if (Math.abs(x - nx) > 0.6 || Math.abs(y - ny) > 0.6) {
    if (Math.abs(car.speed) > 2.2) { sfx.crash(); car.health -= 6; if (isPlayer) hurt(3); }
    car.speed *= -0.25;
  }
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const d = dist2(x, y, other.x, other.y);
    if (d < 40 * 40 && d > 0.01) {
      const dd = Math.sqrt(d);
      x += ((x - other.x) / dd) * (40 - dd) * 0.5;
      y += ((y - other.y) / dd) * (40 - dd) * 0.5;
      if (Math.abs(car.speed) > 2.4) { sfx.crash(); other.health -= 8; car.health -= 5; if (isPlayer) addCrime(0.25); }
      car.speed *= 0.7;
      other.speed *= 0.8;
    }
  }
  // running over a pedestrian: a serious crime, and it slows the car
  if (Math.abs(car.speed) > 1.2) {
    for (const ped of peds) {
      if (ped.dead || ped.state === 'drive') continue;
      if (dist2(x, y, ped.x, ped.y) < 24 * 24) {
        ped.dead = true;
        G.kills++;
        addCrime(1);
        car.speed *= 0.55;
        if (isPlayer) showToast('You ran someone down — the police are coming');
      }
    }
  }
  car.x = clamp(x, 18, WORLD - 18);
  car.y = clamp(y, 18, WORLD - 18);
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    if (car.driver === 'player') {
      player.car = null;
      showToast('Your ride is wrecked — get out and find another');
    } else if (car.driver) {
      car.driver.state = 'flee';
      car.driver.x = car.x + 20;
      car.driver.y = car.y;
      car.driver = null;
    }
  }
}

function updateTraffic(dt) {
  for (const car of cars) {
    if (car.dead || car.driver === 'player') continue;
    if (car.kind === 'parked' || car.kind === 'marked') continue;
    if (car.kind === 'police') { updatePolice(car, dt); continue; }
    if (car.kind === 'repo') { updateRepo(car, dt); continue; }
    // traffic: follow the road you are on, turn at intersections, stop for trouble ahead
    const cruise = car.cruise ?? 2.6;
    let want = cruise;
    const aheadX = car.x + Math.cos(car.angle) * 52;
    const aheadY = car.y + Math.sin(car.angle) * 52;
    for (const other of cars) {
      if (other !== car && dist2(aheadX, aheadY, other.x, other.y) < 34 * 34) want = 0;
    }
    if (player.car === null && dist2(aheadX, aheadY, player.x, player.y) < 26 * 26) want = 0;
    car.speed += clamp(want - car.speed, -0.09, 0.05);
    // at an intersection, sometimes turn onto the crossing road
    const near = nearestRoadPoint(car.x, car.y);
    if (near && dist2(car.x, car.y, near.x, near.y) < 24 * 24 && G.time > car.turnAt && rand() < 0.4) {
      car.turnAt = G.time + 4;
      const options = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter((a) => Math.abs(angDiff(a, car.angle)) > 0.2 && Math.abs(angDiff(a, car.angle + Math.PI)) > 0.2);
      if (options.length) car.angle = pick(options) + (car.angle > 0 ? 0 : 0);
      // snap into the right-hand lane of the new road
      if (Math.abs(Math.cos(car.angle)) > 0.7) car.y = near.y + (Math.cos(car.angle) > 0 ? 22 : -22) * Math.sign(Math.sin(car.angle) || 1);
    }
    // keep to a lane: drift toward the lane offset of the road being followed
    moveCar(car, dt);
    if (car.driver) { car.driver.x = car.x; car.driver.y = car.y; }
  }
}

function updateRepo(car, dt) {
  // the repo driver flees the player and circles the east side
  const away = Math.atan2(car.y - player.y, car.x - player.x);
  const d = Math.sqrt(dist2(car.x, car.y, player.x, player.y));
  const wantAngle = d < 320 ? away : car.angle + 0.004;
  car.angle += clamp(angDiff(wantAngle, car.angle), -0.03, 0.03);
  car.speed += clamp((d < 320 ? 4.4 : 2.4) - car.speed, -0.08, 0.06);
  moveCar(car, dt);
  if (car.driver) { car.driver.x = car.x; car.driver.y = car.y; }
  if (car.health < 45 && car.driver) {
    // hurt enough: the driver bails and runs
    car.driver.state = 'flee';
    car.driver.x = car.x + 22;
    car.driver.y = car.y + 6;
    car.driver = null;
    car.kind = 'marked';
    car.speed = 0;
    showToast('The driver bailed — the car is yours, take it');
  }
}

function updatePolice(car, dt) {
  const target = player.car ?? player;
  const d = Math.sqrt(dist2(car.x, car.y, target.x, target.y));
  const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
  car.angle += clamp(angDiff(wantAngle, car.angle), -0.045, 0.045);
  const top = G.wanted >= 4 ? 6.9 : 6.2;
  car.speed += clamp((d > 60 ? top : 2.2) - car.speed, -0.12, 0.09);
  moveCar(car, dt);
  if (player.car === null && d < 34) {
    G.bustMeter += dt;
    if (G.bustMeter > 2.2) return gameOver('busted');
  }
  if (player.car && d < 40 && Math.abs(player.car.speed) < 0.5) {
    G.bustMeter += dt * 0.7;
    if (G.bustMeter > 3) return gameOver('busted');
  }
}

function updatePeds(dt) {
  for (const ped of peds) {
    if (ped.dead || ped.state === 'drive') continue;
    if (ped.state === 'flee') {
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.x += Math.cos(away) * 2.5;
      ped.y += Math.sin(away) * 2.5;
      [ped.x, ped.y] = collideBuildings(ped.x, ped.y, 10);
      if (G.time > ped.panicAt) ped.state = 'walk';
      continue;
    }
    if (rand() < 0.008) {
      const near = nearestRoadPoint(ped.x, ped.y);
      ped.tx = (near ? near.x : ped.x) + rr(-90, 90);
      ped.ty = (near ? near.y : ped.y) + rr(-90, 90);
    }
    const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 6) {
      ped.x += (dx / dd) * 0.85;
      ped.y += (dy / dd) * 0.85;
      ped.angle = Math.atan2(dy, dx);
      const [nx, ny] = collideBuildings(ped.x, ped.y, 10);
      if (Math.abs(nx - ped.x) > 0.1 || Math.abs(ny - ped.y) > 0.1) { ped.tx = ped.x + rr(-60, 60); ped.ty = ped.y + rr(-60, 60); }
      ped.x = clamp(nx, 12, WORLD - 160);
      ped.y = clamp(ny, 12, WORLD - 12);
    }
    // panic when violence happens nearby
    if (G.time - player.shotAt < 0.4 && dist2(ped.x, ped.y, player.x, player.y) < 180 * 180) { ped.state = 'flee'; ped.panicAt = G.time + 3; }
  }
}

function hurt(n) {
  G.health -= n;
  if (G.health <= 0) gameOver('wasted');
}

// ---------------------------------------------------------------- systems

let policeTimer = 0;
function updateWanted(dt) {
  const cops = cars.filter((c) => c.kind === 'police' && !c.dead);
  // keep the pressure proportional to the stars
  policeTimer -= dt;
  if (G.wanted > 0 && cops.length < G.wanted + 1 && policeTimer <= 0) {
    policeTimer = 2.4;
    const a = rr(0, Math.PI * 2);
    const px = clamp(player.x + Math.cos(a) * 620, 60, WORLD - 260);
    const py = clamp(player.y + Math.sin(a) * 620, 60, WORLD - 60);
    const near = nearestRoadPoint(px, py);
    const cop = makeCar(near ? near.x : px, near ? near.y : py, 0, 'police');
    cop.driver = makePed(cop.x, cop.y);
    cop.driver.state = 'drive';
  }
  // far-away cops give up and leave the world
  for (const cop of cops) {
    if (dist2(cop.x, cop.y, player.x, player.y) > 950 * 950) {
      cop.dead = true;
      if (cop.driver) cop.driver.dead = true;
    }
  }
  // unseen and calm: the heat cools, then the stars fade
  const seen = cops.some((c) => dist2(c.x, c.y, player.x, player.y) < 430 * 430);
  if (!seen && G.wanted > 0) {
    G.heat -= dt * 0.05;
    if (G.heat <= 0) {
      G.wanted--;
      G.heat = G.wanted > 0 ? 0.85 : 0;
      if (G.wanted === 0) showToast('You lost the police');
    }
  }
  if (!cops.length) G.bustMeter = Math.max(0, G.bustMeter - dt * 1.4);
}

function updatePickups() {
  for (const pk of pickups) {
    if (pk.taken) continue;
    if (dist2(player.x, player.y, pk.x, pk.y) < 30 * 30 && !player.car) {
      pk.taken = true;
      sfx.pickup();
      if (pk.kind === 'gun') { G.hasGun = true; G.ammo += 12; showToast('Picked up a pistol (+12 rounds)'); }
      if (pk.kind === 'ammo') { G.ammo += 8; showToast('+8 pistol rounds'); }
      if (pk.kind === 'health') { G.health = Math.min(100, G.health + 45); showToast('Patched up (+45 health)'); }
    }
  }
}

function updateMission(dt) {
  const st = currentStage();
  if (!st) return;
  const ms = G.missionState;
  if (ms.timer !== null && ms.timer !== undefined) {
    ms.timer -= dt;
    if (ms.timer <= 0) return failMission('you ran out of time');
  }
  // repo stage: it completes by taking the car once the driver bails
  if (st.needCar === 'repo') {
    if (player.car === markedCar) advanceStage();
    return;
  }
  if (st.needCar === 'marked') {
    if (player.car === markedCar) advanceStage();
    return;
  }
  const p = stagePoint();
  if (!p) return;
  if (st.inCar && !player.car) return;
  if (dist2(player.x, player.y, p.x, p.y) < (st.inCar ? 78 : 40) ** 2) advanceStage();
}

function gameOver(kind) {
  if (G.mode !== 'play') return;
  G.mode = 'over';
  const title = document.getElementById('overlay-title');
  const text = document.getElementById('overlay-text');
  if (kind === 'wasted') {
    title.textContent = 'WASTED';
    title.style.background = 'linear-gradient(180deg,#ff5a5a,#8f1d1d)';
    G.money = Math.max(0, G.money - 150);
    text.textContent = 'You wake up outside Klinik Sehat. The hospital bill takes $150.';
  } else {
    title.textContent = 'BUSTED';
    title.style.background = 'linear-gradient(180deg,#7db8ff,#274b8f)';
    const fine = Math.min(G.money, 100 + G.wanted * 60);
    G.money -= fine;
    text.textContent = `Harbor Police let you go after a $${fine} fine. Your wanted level is cleared.`;
  }
  title.style.webkitBackgroundClip = 'text';
  title.style.backgroundClip = 'text';
  title.style.color = 'transparent';
  document.getElementById('overlay').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  sfx.fail();
}

function respawn() {
  G.health = 100;
  G.wanted = 0;
  G.heat = 0;
  G.bustMeter = 0;
  player.car = null;
  player.x = 3 * ROAD_EVERY + 60;
  player.y = 4 * ROAD_EVERY - 40;
  for (const c of cars) if (c.kind === 'police') { c.dead = true; if (c.driver) c.driver.dead = true; }
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  G.mode = 'play';
  saveGame();
}

function endStory() {
  G.mode = 'end';
  const title = document.getElementById('overlay-title');
  title.textContent = 'CLEAN SLATE';
  title.style.background = 'linear-gradient(180deg,#7dff8a,#1d8f4e)';
  title.style.webkitBackgroundClip = 'text';
  title.style.backgroundClip = 'text';
  title.style.color = 'transparent';
  document.getElementById('overlay-text').textContent = `The boat pulls out of Vice Harbor at dawn. Debt paid: $${G.money} in your pocket, ${G.stolen} cars stolen, ${G.kills} bodies on your conscience. Dewi waves from the dock. Free roam is yours — the city never sleeps.`;
  document.getElementById('respawn').textContent = 'KEEP ROAMING';
  document.getElementById('overlay').style.display = 'flex';
  saveGame();
}

// ---------------------------------------------------------------- save / UI

const SAVE_KEY = 'viceharbor-save-v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, mission: G.mission, hasGun: G.hasGun, ammo: G.ammo, kills: G.kills, stolen: G.stolen, x: player.x, y: player.y }));
  } catch { /* private mode: play without saving */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let bannerUntil = 0;
function showBanner(text, ms = 4000) {
  const b = document.getElementById('banner');
  b.innerHTML = text.replace(/\n/g, '<br>');
  b.style.display = 'block';
  bannerUntil = performance.now() + ms;
}
let toastUntil = 0;
function showToast(text, ms = 3000) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.style.display = 'block';
  toastUntil = performance.now() + ms;
}
function pauseGame() {
  if (G.mode !== 'play') return;
  G.mode = 'pause';
  document.getElementById('pause-stats').textContent = `Money $${G.money} · Job ${Math.min(G.mission + 1, MISSIONS.length)} of ${MISSIONS.length} · Cars stolen ${G.stolen} · Progress is saved automatically after every job.`;
  document.getElementById('pause').style.display = 'flex';
  saveGame();
}
function resumeGame() {
  document.getElementById('pause').style.display = 'none';
  G.mode = 'play';
}

const moneyEl = document.getElementById('money');
const wantedEl = document.getElementById('wanted');
const healthEl = document.getElementById('health');
const weaponEl = document.getElementById('weapon');
const promptEl = document.getElementById('prompt');
function updateHUD() {
  moneyEl.textContent = `$${G.money}`;
  wantedEl.innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= G.wanted ? '' : 'off'}">★</span>`).join('');
  healthEl.style.width = `${clamp(G.health, 0, 100)}%`;
  healthEl.style.background = G.bustMeter > 0.4 ? '#7db8ff' : '';
  weaponEl.textContent = G.hasGun ? `Pistol · ${G.ammo} rounds` : 'Fists';
  const now = performance.now();
  if (now > bannerUntil) document.getElementById('banner').style.display = 'none';
  if (now > toastUntil) document.getElementById('toast').style.display = 'none';
  // contextual prompt
  let prompt = '';
  if (!player.car) {
    let bd = 52 * 52;
    for (const car of cars) if (!car.dead && dist2(player.x, player.y, car.x, car.y) < bd) { prompt = 'Press E to get in'; break; }
    const st = currentStage();
    if (st && st.timer != null && G.missionState?.timer != null) prompt = `Time left: ${Math.ceil(G.missionState.timer)}s`;
  } else if (G.missionState && currentStage()?.timer != null && G.missionState.timer != null) {
    prompt = `Time left: ${Math.ceil(G.missionState.timer)}s`;
  }
  promptEl.textContent = prompt;
  promptEl.style.display = prompt ? 'block' : 'none';
  if (G.bustMeter > 0.3 && G.mode === 'play') {
    promptEl.textContent = 'The police are grabbing you — MOVE!';
    promptEl.style.display = 'block';
  }
}

// ---------------------------------------------------------------- rendering

function drawWorld() {
  camX = clamp(player.x - VW / 2, 0, Math.max(0, WORLD - VW));
  camY = clamp(player.y - VH / 2, 0, Math.max(0, WORLD - VH));
  ctx.save();
  ctx.translate(-camX, -camY);
  // ground: city blocks are pavement, the east strip is beach then sea
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(camX - 20, camY - 20, VW + 40, VH + 40);
  ctx.fillStyle = '#c9b083';
  ctx.fillRect(WATER_X, camY - 20, 130, VH + 40);
  ctx.fillStyle = '#1d6f9f';
  ctx.fillRect(WATER_X + 90, camY - 20, WORLD - WATER_X, VH + 40);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  for (let y = 30; y < WORLD; y += 90) ctx.fillRect(WATER_X + 96, y + ((G.time * 12) % 30), 26, 3);
  // parks
  ctx.fillStyle = '#3f7d3a';
  for (const [bx, by] of [[2, 2], [4, 5]]) {
    ctx.fillRect(bx * ROAD_EVERY + ROAD_W / 2 + 8, by * ROAD_EVERY + ROAD_W / 2 + 8, ROAD_EVERY - ROAD_W - 16, ROAD_EVERY - ROAD_W - 16);
  }
  // roads
  ctx.fillStyle = '#26262b';
  for (const rx of roads) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD);
  for (const ry of roads) ctx.fillRect(0, ry - ROAD_W / 2, WORLD, ROAD_W);
  ctx.strokeStyle = '#d8c95a';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const rx of roads) { ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD); ctx.stroke(); }
  for (const ry of roads) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD, ry); ctx.stroke(); }
  ctx.setLineDash([]);
  // mission marker: a glowing pillar at the stage point
  const mp = stagePoint();
  if (mp && G.mode !== 'menu') {
    const pulse = 14 + Math.sin(G.time * 4) * 4;
    ctx.fillStyle = 'rgba(255,210,62,.3)';
    ctx.fillRect(mp.x - 16, mp.y - 190, 32, 190);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10131c';
    ctx.font = 'bold 15px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText('!', mp.x, mp.y + 5);
  }
  // pickups
  for (const pk of pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = pk.kind === 'gun' ? '#ffd23e' : pk.kind === 'ammo' ? '#ff9a3e' : '#ff5a7a';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 9 + Math.sin(G.time * 3 + pk.x) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10131c';
    ctx.font = 'bold 11px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'gun' ? 'G' : pk.kind === 'ammo' ? 'A' : '+', pk.x, pk.y + 4);
  }
  // trees and lamps
  for (const t of trees) {
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath(); ctx.arc(t.x + 3, t.y + 4, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.park ? '#2e6b2a' : '#3f9150';
    ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57ab5e';
    ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ffd98a';
  for (const l of lamps) { ctx.beginPath(); ctx.arc(l.x, l.y, 3, 0, Math.PI * 2); ctx.fill(); }
  // buildings: shadow, walls, roof, name
  for (const b of buildings) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.strokeRect(b.x + 12.5, b.y + 12.5, b.w - 25, b.h - 25);
    if (b.name && b.w > 84) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '11px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // dead peds stay on the ground
  for (const ped of peds) {
    if (!ped.dead) continue;
    ctx.fillStyle = 'rgba(120,10,10,.55)';
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 11, 0, Math.PI * 2); ctx.fill();
  }
  for (const ped of peds) {
    if (ped.dead || ped.state === 'drive') continue;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.arc(ped.x + 2, ped.y + 3, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 4.6, 0, Math.PI * 2); ctx.fill();
    if (ped.state === 'flee') { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Verdana'; ctx.textAlign = 'center'; ctx.fillText('!', ped.x, ped.y - 13); }
  }
  // cars
  for (const car of cars) {
    if (car.dead) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#1c1c20';
      ctx.fillRect(-21, -11, 42, 22);
      ctx.fillStyle = 'rgba(120,120,120,.5)';
      ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(G.time * 2 + car.x) * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(-19, -8, 44, 23);
    ctx.fillStyle = car.color;
    ctx.fillRect(-21, -11, 42, 22);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-13, -9, 10, 18);
    ctx.fillRect(4, -9, 8, 18);
    ctx.fillStyle = '#bfe8ff';
    ctx.fillRect(-3, -8, 6, 16);
    ctx.fillStyle = '#111';
    ctx.fillRect(-19, -13, 9, 4); ctx.fillRect(10, -13, 9, 4); ctx.fillRect(-19, 9, 9, 4); ctx.fillRect(10, 9, 9, 4);
    ctx.fillStyle = '#fff8b0';
    ctx.fillRect(19, -8, 2.6, 5); ctx.fillRect(19, 3, 2.6, 5);
    ctx.fillStyle = '#ff4040';
    ctx.fillRect(-21.5, -8, 2.4, 5); ctx.fillRect(-21.5, 3, 2.4, 5);
    if (car.kind === 'police') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-8, -11, 16, 22);
      ctx.fillStyle = Math.floor(G.time * 2.4) % 2 ? '#ff3030' : '#3070ff';
      ctx.fillRect(-3, -4, 6, 8);
      ctx.fillStyle = '#10131c';
      ctx.font = 'bold 8px Verdana';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
    }
    if (car === markedCar) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(-24, -14, 48, 28);
    }
    ctx.restore();
  }
  // bullets
  ctx.fillStyle = '#ffe9a8';
  for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
  // the player on foot
  if (!player.car && G.mode !== 'menu') {
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.arc(player.x + 2, player.y + 3, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(player.x, player.y, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(player.x, player.y, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(player.x + Math.cos(player.angle) * 8, player.y + Math.sin(player.angle) * 8, 3, 0, Math.PI * 2);
    ctx.fill();
    if (G.time - player.punchAt < 0.18) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath();
      ctx.arc(player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // direction arrow to the mission point at the screen edge
  if (mp && G.mode === 'play') {
    const dx = mp.x - player.x, dy = mp.y - player.y;
    if (Math.hypot(dx, dy) > 130) {
      const a = Math.atan2(dy, dx);
      const ax = player.x + Math.cos(a) * 54, ay = player.y + Math.sin(a) * 54;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(a) * 12, ay + Math.sin(a) * 12);
      ctx.lineTo(ax + Math.cos(a + 2.5) * 9, ay + Math.sin(a + 2.5) * 9);
      ctx.lineTo(ax + Math.cos(a - 2.5) * 9, ay + Math.sin(a - 2.5) * 9);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMinimap() {
  const S = 196 / WORLD;
  mm.fillStyle = '#101720';
  mm.fillRect(0, 0, 196, 196);
  mm.fillStyle = '#2c3540';
  for (const rx of roads) mm.fillRect(rx * S - 2, 0, 4, 196);
  for (const ry of roads) mm.fillRect(0, ry * S - 2, 196, 4);
  mm.fillStyle = '#1d6f9f';
  mm.fillRect((WATER_X + 90) * S, 0, 196, 196);
  mm.fillStyle = '#3f7d3a';
  for (const [bx, by] of [[2, 2], [4, 5]]) mm.fillRect((bx * ROAD_EVERY + 60) * S, (by * ROAD_EVERY + 60) * S, 16, 16);
  for (const car of cars) {
    if (car.dead) continue;
    mm.fillStyle = car.kind === 'police' ? (Math.floor(G.time * 2.4) % 2 ? '#ff4040' : '#4d8dff') : car === markedCar ? '#ffd23e' : '#9aa7b5';
    mm.fillRect(car.x * S - 1.6, car.y * S - 1.6, 3.2, 3.2);
  }
  const mp = stagePoint();
  if (mp) {
    mm.fillStyle = '#ffd23e';
    mm.beginPath();
    mm.arc(mp.x * S, mp.y * S, 4.4 + Math.sin(G.time * 4) * 1.2, 0, Math.PI * 2);
    mm.fill();
  }
  mm.fillStyle = '#fff';
  mm.beginPath();
  mm.arc(player.x * S, player.y * S, 3.4, 0, Math.PI * 2);
  mm.fill();
  mm.strokeStyle = 'rgba(255,255,255,.5)';
  mm.strokeRect(camX * S, camY * S, VW * S, VH * S);
}

// ---------------------------------------------------------------- the loop

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (G.mode === 'play') {
    G.time += dt;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updateWanted(dt);
    updatePickups();
    updateMission(dt);
    for (const b of bullets) {
      b.x += Math.cos(b.angle) * 640 * dt;
      b.y += Math.sin(b.angle) * 640 * dt;
      b.life -= dt;
    }
    for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].life <= 0) bullets.splice(i, 1);
    // gentle health regen keeps long sessions survivable
    if (G.health > 0 && G.health < 100) G.health = Math.min(100, G.health + dt * 1.1);
    updateHUD();
  } else if (G.mode === 'menu') {
    G.time += dt * 0.4;
    // a slow pan over the city behind the title
    player.x = WORLD / 2 + Math.cos(G.time * 0.05) * 500;
    player.y = WORLD / 2 + Math.sin(G.time * 0.037) * 500;
  }
  drawWorld();
  if (G.mode === 'play' || G.mode === 'pause') drawMinimap();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- boot

function startGame(fromSave) {
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  audio();
  if (fromSave) {
    const s = loadGame();
    if (s) {
      G.money = s.money; G.mission = s.mission; G.hasGun = s.hasGun; G.ammo = s.ammo;
      G.kills = s.kills ?? 0; G.stolen = s.stolen ?? 0;
      player.x = s.x ?? 420; player.y = s.y ?? 420;
    }
  }
  G.mode = 'play';
  if (G.mission < MISSIONS.length) startMission(G.mission);
  else showBanner('Vice Harbor is yours. Free roam — jobs done, debt paid.', 5000);
}

document.getElementById('newgame').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch { } G.mission = 0; G.money = 120; startGame(false); });
document.getElementById('continue').addEventListener('click', () => startGame(true));
document.getElementById('respawn').addEventListener('click', () => {
  if (G.mode === 'end') {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('respawn').textContent = 'RESPAWN';
    G.mode = 'play';
  } else respawn();
});
document.getElementById('resume').addEventListener('click', resumeGame);
document.getElementById('savequit').addEventListener('click', () => {
  saveGame();
  document.getElementById('pause').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu').style.display = 'flex';
  G.mode = 'menu';
});

spawnWorld();
if (loadGame()) document.getElementById('continue').style.display = 'inline-block';

// Screenshot scenes for the entry's screenshots (shots.json): deterministic
// set-ups the judge's captures use — a posed city, a chase, a harbor run.
if (SHOT) {
  document.getElementById('menu').style.display = SHOT === 'start' ? 'flex' : 'none';
  if (SHOT !== 'start') {
    document.getElementById('hud').style.display = 'block';
    G.mode = 'play';
    G.hasGun = true;
    G.ammo = 24;
    G.money = 2740;
    if (SHOT === 'play') {
      player.x = 2 * ROAD_EVERY; player.y = 2 * ROAD_EVERY + 120;
      const car = makeCar(player.x - 30, player.y + 6, 0, 'marked');
      car.color = '#3f7fbf';
      markedCar = car;
      startMission(0);
    } else if (SHOT === 'chase') {
      player.x = 4 * ROAD_EVERY; player.y = 3 * ROAD_EVERY;
      const car = makeCar(player.x, player.y, Math.PI / 2, 'traffic');
      car.color = '#d64541';
      player.car = car;
      car.driver = 'player';
      car.speed = 5;
      setWanted(4);
      for (let i = 0; i < 3; i++) {
        const cop = makeCar(player.x - 120 - i * 70, player.y + (i - 1) * 46, Math.PI / 2, 'police');
        cop.speed = 4.6;
      }
      showBanner('Job 5 — Harbor Run\nReach the boat at the harbor!', 60000);
      G.mission = 4;
      G.missionState = { stage: 0, timer: 96 };
    } else if (SHOT === 'end') {
      G.mode = 'end';
      document.getElementById('hud').style.display = 'none';
      endStory();
    }
  }
}
