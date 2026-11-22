import { centerline, coursePoint, halfRoad, mapPoint, nearestRoad, roadDistance, start, startIndex, wallOffset, wallSegments } from './track.js';
import {
  advanceProgress, catchUpFactor, countdownSeconds, finish, hitWall, resetProgress,
  resolveKartCollisions, standings, updateWrongWay, wallClearance,
} from './race.js';
import { headDetails, playerColors, roster } from './roster.js';
import { bananaColor, bananaSpinTime, createTrackItems, mushroomColor, mushroomTopSpeed, shellColor } from './track-items.js';

const select = id => document.getElementById(id);
const views = select('views');
const mapCars = select('map-cars');
const mapPickups = select('map-pickups');
const courseFilm = select('course-film');
const filmContext = courseFilm.getContext('2d', { alpha: false });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ranking = select('standings');
const fullscreenButton = select('fullscreen');
const layout = document.querySelector('.layout');
const screens = { menu: select('menu'), selection: select('selection'), racing: select('race') };
const startButton = select('start');
const status = document.querySelector('#phone-status');
const link = document.querySelector('#pair-link');
const qr = document.querySelector('#qr');
const note = document.querySelector('#pair-note');
const copy = document.querySelector('#copy');

const tau = 2 * Math.PI;
const turboStages = [
  { charge: 0.62, duration: 0.52, color: '#5deaff' },
  { charge: 1.4, duration: 0.85, color: '#ffbd59' },
  { charge: 2.45, duration: 1.18, color: '#e999ff' },
];
const chase = {
  fieldOfView: 48,
  speedWidening: 9,
  distance: 7.6,
  speedPullback: 1.35,
  height: 3.9,
  targetHeight: 1.32,
  lookAhead: 1.25,
};
const keys = new Set();
let room = { phase: 'menu', mode: 'test', round: 0, players: [], soloPick: 0 };
let cars = [];
let elapsed = 0;
let rosterSignature = '';
let drawnRound = -1;
let hostRequest = false;
let live = true;
let lastFrame = performance.now();
let pendingTime = 0;
let trackItems = createTrackItems();
let pickups = [];
let pickupMarkers = '';
let lastFilmDraw = -Infinity;
let width, height, focal, ctx;

function fullscreenState() {
  fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
  fullscreenButton.setAttribute('aria-pressed', String(!!document.fullscreenElement));
}
fullscreenButton.hidden = !document.documentElement.requestFullscreen;
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreenButton.textContent = 'Fullscreen unavailable';
  }
});
document.addEventListener('fullscreenchange', fullscreenState);

function reset(car, index) {
  const [x, , z] = coursePoint(startIndex - Math.floor(index / 2) * 2,
    cars.length > 1 ? (index % 2 === 0 ? -2.7 : 2.7) : 0);
  Object.assign(car, {
    x, z, yaw: start.yaw, speed: 0, steering: 0, slip: 0, driftDirection: 0, charge: 0,
    boostTime: 0, boostColor: '', spinTime: 0, effectTime: 0, surface: 'ON TRACK', surfaceColor: '',
    hasShell: false, fireQueued: false, lastShellShot: car.controls.shellShot ?? 0, wallContact: false,
  });
  Object.assign(car.camera, { x, z, yaw: car.yaw, speed: 0 });
  resetProgress(car);
}

function createViews(players) {
  elapsed = 0;
  pendingTime = 0;
  trackItems = createTrackItems();
  pickups = [];
  pickupMarkers = '';
  mapPickups.replaceChildren();
  views.replaceChildren();
  mapCars.replaceChildren();
  views.dataset.count = players.length;
  cars = players.map(player => {
    const car = { ...player, camera: {}, controls: player };
    const panel = document.createElement('article');
    panel.className = 'viewport';
    panel.style.setProperty('--seat', playerColors[player.number - 1]);
    panel.innerHTML = `
      <canvas aria-label="Chase camera for player ${player.number}"></canvas>
      <div class="view-label"><strong>P${player.number}</strong> ${roster[player.character].name}</div>
      <div class="wrong-way" role="status" hidden>Wrong Way</div>
      <div class="race-label"></div>
      <div class="race-countdown" aria-hidden="true"></div>
      <div class="speed"><strong>0</strong><span>KM/H</span></div>
      <div class="surface">ON TRACK</div>`;
    views.append(panel);
    car.canvas = panel.querySelector('canvas');
    car.context = car.canvas.getContext('2d', { alpha: false });
    car.speedLabel = panel.querySelector('.speed strong');
    car.surfaceLabel = panel.querySelector('.surface');
    car.raceLabel = panel.querySelector('.race-label');
    car.wrongWayLabel = panel.querySelector('.wrong-way');
    car.countdownLabel = panel.querySelector('.race-countdown');
    const shellBadge = document.createElement('div');
    shellBadge.className = 'shell-badge';
    shellBadge.textContent = 'Green shell ready';
    shellBadge.hidden = true;
    panel.append(shellBadge);
    car.shellBadge = shellBadge;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circle = document.createElementNS(marker.namespaceURI, 'circle');
    circle.setAttribute('r', '4.3');
    circle.setAttribute('fill', playerColors[player.number - 1]);
    const text = document.createElementNS(marker.namespaceURI, 'text');
    text.textContent = player.number;
    marker.append(circle, text);
    mapCars.append(marker);
    car.marker = marker;
    return car;
  });
  cars.forEach(reset);
}
document.querySelector('#map-course').setAttribute('d', centerline.map(([x, , z], i) =>
  (i ? 'L' : 'M') + mapPoint(x, z).map(value => value.toFixed(1)).join(' ')).join(' ') + ' Z');
select('map-walls').setAttribute('d', wallSegments.map(segment =>
  segment.map(([x, z], i) => (i ? 'L' : 'M') + mapPoint(x, z).map(value => value.toFixed(1)).join(' ')).join(' ')).join(' '));
const driveKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', 'e']);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (room.phase !== 'racing' || !driveKeys.has(key) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (key === 'e') {
    const driver = cars.find(car => car.keyboard || car.number === 1);
    if (driver && !event.repeat) driver.fireQueued = true;
    return;
  }
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

async function host(action, character) {
  if (hostRequest) return;
  hostRequest = true;
  try {
    const response = await fetch('/room', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, character }) });
    updateRoom(await response.json());
  } catch {
    status.lastElementChild.textContent = 'Display disconnected';
  } finally {
    hostRequest = false;
  }
}
for (const [button, action] of [['test-mode', 'test'], ['play-mode', 'play'], ['back', 'menu'], ['start', 'start']]) {
  select(button).addEventListener('click', () => host(action));
}

const characterCards = roster.map((driver, index) => {
  const button = document.createElement('button');
  button.className = 'character';
  button.type = 'button';
  button.innerHTML = `${avatar(driver)}<strong>${driver.name}</strong><span class="pick-markers"></span>`;
  button.addEventListener('click', () => {
    if (!room.players.some(player => player.connected)) host('pick', index);
  });
  select('roster').append(button);
  return button;
});

function updateLobby() {
  const players = room.players.filter(player => player.connected);
  const signature = JSON.stringify([room.phase, room.mode, room.soloPick, players]);
  if (signature === rosterSignature) return;
  rosterSignature = signature;
  status.classList.toggle('connected', players.length > 0);
  status.lastElementChild.textContent = players.length ? `${players.length} / 4 phones joined` : 'Waiting for phones';
  select('seats').replaceChildren(...players.map(player => seatBadge(player)));
  if (room.phase !== 'selection') return;
  const picks = players.length ? players : [{ number: 1, character: room.soloPick, ready: true }];
  for (const [index, button] of characterCards.entries()) {
    const selected = picks.filter(player => player.character === index);
    button.setAttribute('aria-disabled', String(players.length > 0));
    button.querySelector('.pick-markers').replaceChildren(...selected.map(player => seatBadge(player, true)));
    button.classList.toggle('selected', selected.length > 0);
    if (selected.length) {
      const colors = selected.map(player => playerColors[player.number - 1]);
      button.style.borderColor = colors[0];
      button.style.boxShadow = colors.map((color, i) => `0 0 0 ${(i + 1) * 2}px ${color}`).join(',');
    } else {
      button.style.borderColor = '';
      button.style.boxShadow = '';
    }
  }
  startButton.disabled = players.some(player => !player.ready);
  startButton.textContent = 'Start race';
  select('lobby-help').textContent = players.length
    ? 'Use the arrows on your phone, then confirm your driver.' : 'Select a driver or scan the QR code to join.';
}

function seatBadge(player, showReady = false) {
  const badge = document.createElement('span');
  badge.className = 'seat-badge';
  badge.style.setProperty('--seat', playerColors[player.number - 1]);
  badge.textContent = `P${player.number}${showReady && player.ready ? ' ✓' : ''}`;
  return badge;
}
function updateRoom(state) {
  if (!state?.players) return;
  room = state;
  live = true;
  for (const [phase, element] of Object.entries(screens)) element.hidden = phase !== room.phase;
  select('back').hidden = room.phase === 'menu';
  select('pairing').hidden = room.phase === 'racing';
  select('race-info').hidden = room.phase !== 'racing';
  layout.classList.toggle('race-layout', room.phase === 'racing');
  courseFilm.hidden = room.phase === 'racing';
  if (room.phase === 'racing') {
    if (drawnRound !== room.round) {
      drawnRound = room.round;
      createViews(room.players);
    }
    for (const [index, player] of room.players.entries()) cars[index].controls = player;
  } else {
    keys.clear();
    updateLobby();
  }
}
const events = new EventSource('/events');
events.onmessage = event => updateRoom(JSON.parse(event.data));
events.onerror = () => { live = false; };

async function refreshPairing() {
  try {
    const response = await fetch('/pairing');
    if (!response.ok) throw new Error('Pairing unavailable');
    const { url, tunnelStatus, localHttps } = await response.json();
    if (link.href !== url) {
      link.href = url;
      qr.src = '/pairing.svg?v=' + encodeURIComponent(url);
    }
    const text = {
      starting: 'Starting the HTTPS link for tilt. The QR code will update.',
      ready: 'HTTPS link ready. On your phone, tap Enable tilt.',
      failed: 'HTTPS link unavailable. Tilt requires HTTPS.',
      off: localHttps ? 'Use the same Wi-Fi. Follow the README to trust the phone certificate before scanning.'
        : url.startsWith('https:')
        ? 'Use the same Wi-Fi and a phone that trusts your HTTPS certificate.'
        : 'Use the same Wi-Fi. Tilt requires an HTTPS connection.',
    }[tunnelStatus];
    if (note.textContent !== text) note.textContent = text;
  } catch {
    note.textContent = 'Waiting for the controller link.';
  }
}
refreshPairing();
setInterval(refreshPairing, 2000);
copy.addEventListener('click', async () => {
  if (!link.href) return;
  try {
    await navigator.clipboard.writeText(link.href);
    copy.textContent = 'Link copied';
  } catch {
    copy.textContent = 'Open link from the QR code';
  }
  setTimeout(() => { copy.textContent = 'Copy controller link'; }, 1600);
});

function down(...names) {
  return Number(names.some(key => keys.has(key)));
}

function turboStage(charge) {
  return turboStages.findLast(stage => charge >= stage.charge);
}

function physics(car, dt, pace) {
  const camera = car.camera;
  const previousX = car.x;
  const previousZ = car.z;
  const keyboard = car.keyboard || car.number === 1;
  const keyboardSteer = keyboard ? down('d', 'arrowright') - down('a', 'arrowleft') : 0;
  const keyboardThrottle = keyboard ? down('w', 'arrowup') - down('s', 'arrowdown') : 0;
  const phone = car.controls;
  const spinning = car.spinTime > 0;
  const finished = car.finishedAt !== null;
  const steer = spinning ? 0 : keyboardSteer || (live && phone.steer) || 0;
  const canDrive = !finished && !spinning;
  const requestedThrottle = canDrive ? keyboardThrottle || (live && phone.throttle) || 0 : 0;
  const driftButton = !spinning && keyboardThrottle === 0 && live && phone.brake;
  const keyboardDrift = keyboard && keys.has('shift');
  const reverseFromStop = canDrive && (driftButton || keyboardDrift) && requestedThrottle === 0 && car.speed <= 0;
  const throttle = reverseFromStop ? -1 : requestedThrottle;
  const brake = finished || driftButton;
  const road = nearestRoad(car.x, car.z);
  const { distance } = road;
  const onRoad = distance < halfRoad + 0.45;
  const driftHeld = throttle > 0 && (driftButton || keyboardDrift);
  const canDrift = onRoad && car.speed > 7;
  if (car.driftDirection && (!driftHeld || !canDrift)) {
    const turbo = turboStage(car.charge);
    if (!driftHeld && canDrift && throttle > 0 && turbo) {
      car.boostTime = turbo.duration;
      car.boostColor = turbo.color;
      car.speed = Math.max(car.speed, 25);
    }
    car.driftDirection = 0;
    car.charge = 0;
  }
  if (!car.driftDirection && driftHeld && canDrift && Math.abs(steer) > 0.17) {
    car.driftDirection = Math.sign(steer);
    // Rotate the visual body immediately, without changing its travel heading.
    car.slip = car.driftDirection * 0.40;
  }
  const drifting = car.driftDirection !== 0;
  if (drifting) car.charge += dt * (0.78 + Math.max(0, steer * car.driftDirection) * 0.62);
  car.boostTime = onRoad ? Math.max(0, car.boostTime - dt) : 0;
  car.effectTime += dt;
  const boosting = car.boostTime > 0;
  const mushroom = boosting && car.boostColor === mushroomColor;
  const boostedTopSpeed = mushroom ? mushroomTopSpeed : 31;
  const maxSpeed = onRoad ? (boosting ? boostedTopSpeed : 24 * pace) : 17;
  car.steering += (steer - car.steering) * (1 - Math.exp(-12 * dt));
  if (brake && throttle === 0) {
    const speed = Math.max(0, Math.abs(car.speed) - 27 * dt);
    car.speed = speed === 0 ? 0 : Math.sign(car.speed) * speed;
  } else if (throttle) {
    const braking = Math.sign(car.speed) !== throttle && Math.abs(car.speed) > 0.2;
    const acceleration = braking ? 24 : throttle < 0 ? 7 : boosting ? (mushroom ? 14 : 31) :
      (13 - 5 * Math.max(0, car.speed) / maxSpeed) * (onRoad ? pace : 1);
    car.speed += throttle * acceleration * dt;
  } else {
    car.speed *= Math.exp(-(onRoad ? 1.0 : 1.45) * dt);
  }
  if (car.speed > maxSpeed) car.speed = Math.max(maxSpeed, car.speed - (onRoad ? 34 : 15) * dt);
  car.speed = Math.max(-6, car.speed);
  const grip = 1 - Math.exp(-(drifting ? 7 : 9) * dt);
  const driftSteer = car.steering * car.driftDirection;
  const slip = car.driftDirection * (0.40 + 0.14 * driftSteer);
  car.slip += (slip - car.slip) * grip;
  const movingTurnRate = car.speed / (3.8 + Math.abs(car.speed) * 0.42);
  const turnRate = car.wallContact && throttle ? Math.sign(car.speed || throttle) *
    Math.max(0.85, Math.abs(movingTurnRate)) : movingTurnRate;
  const turnInput = drifting ? car.driftDirection * (0.10 + driftSteer * 1.28) : car.steering;
  if (!spinning) car.yaw += turnInput * turnRate * dt;
  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;
  const wall = distance + Math.abs(car.speed) * dt > wallClearance && hitWall(car, previousX, previousZ);
  car.wallContact = wall;
  updateWrongWay(car, road, dt);
  const following = 1 - Math.exp(-8 * dt);
  camera.x += (car.x - camera.x) * following;
  camera.z += (car.z - camera.z) * following;
  camera.yaw += (car.yaw - camera.yaw) * (1 - Math.exp(-5 * dt));
  camera.speed += (Math.min(1.25, Math.max(0, car.speed / 24)) - camera.speed) * following;
  const stage = drifting && turboStage(car.charge);
  car.spinTime = Math.max(0, car.spinTime - dt);
  car.surface = spinning ? car.spinLabel : wall ? 'WALL' :
    boosting ? (mushroom ? 'MUSHROOM BOOST' : 'TURBO') :
    stage ? 'TURBO READY' :
    drifting ? 'DRIFTING' : car.speed < -0.2 ? 'REVERSING' : onRoad ? 'ON TRACK' : 'OFF ROAD';
  car.surfaceColor = spinning ? car.spinColor : wall ? '#ffc29f' : boosting ? car.boostColor : stage ? stage.color : '';
}

function shoreX(z) {
  return 190 + 6 * Math.sin(z / 23) + 3 * Math.sin(z / 11);
}

const terrain = [];
for (let z = -216; z < 216; z += 12) {
  const next = z + 12;
  for (let x = -264; x < 168; x += 12) {
    const colorIndex = Math.abs(13 * ((x + 264) / 12) + 31 * ((z + 216) / 12)) % 3;
    const color = ['#77b654', '#7fbc58', '#82bf5a'][colorIndex];
    terrain.push({ color, points: [[x, 0, z], [x + 12, 0, z], [x + 12, 0, next], [x, 0, next]] });
  }
  const a = shoreX(z);
  const b = shoreX(next);
  terrain.push(
    { color: '#8fc565', points: [[168, 0, z], [a - 2, 0, z], [b - 2, 0, next], [168, 0, next]] },
    { color: '#f0d59d', points: [[a - 2, 0, z], [a + 7, 0, z], [b + 7, 0, next], [b - 2, 0, next]] },
    { color: '#89d8d3', points: [[a + 7, 0, z], [a + 14, 0, z], [b + 14, 0, next], [b + 7, 0, next]] },
  );
}

const road = [];
function strip(a, b, left, right, color) {
  const points = [coursePoint(a, left), coursePoint(a, right), coursePoint(b, right), coursePoint(b, left)];
  road.push({ points, color });
}
for (let i = 0; i < centerline.length; i++) {
  strip(i, i + 1, -halfRoad - 0.7, halfRoad + 0.7, '#b9cd81');
  strip(i, i + 1, -halfRoad, halfRoad, '#556071');
  const edge = i % 2 ? '#fff0d5' : '#e06a56';
  strip(i, i + 1, -halfRoad, -halfRoad + 0.57, edge);
  strip(i, i + 1, halfRoad - 0.57, halfRoad, edge);
}
for (let row = 0; row < 2; row++) {
  for (let column = 0; column < 16; column++) {
    const a = finish - row * 0.31;
    const tileWidth = (halfRoad * 2 - 1.3) / 16;
    const left = 0.65 - halfRoad + column * tileWidth;
    const right = left + tileWidth;
    const points = [left, right, right, left].map((offset, i) => {
      const from = coursePoint(finish - 1, offset);
      const to = coursePoint(finish, offset);
      const t = a - finish + 1 - (i >= 2 ? 0.31 : 0);
      return from.map((value, axis) => value + (to[axis] - value) * t);
    });
    road.push({ points, color: (row + column) % 2 ? '#fff0d5' : '#24354b' });
  }
}

const trees = [];
for (let i = 0; i < 200; i++) {
  const x = Math.sin(i * 41.81) * 153 - 21;
  const z = Math.sin(i * 17.77 + 0.3) * 131;
  if (roadDistance(x, z) > wallOffset + 1 && x < shoreX(z) - 9) {
    trees.push({ x, z, h: 3.2 + 3.5 * Math.abs(Math.sin(i * 5.7)) });
  }
}

let view;
function cameraSpace([x, y, z]) {
  const dx = x - view.x;
  const dz = z - view.z;
  const dy = y - view.y;
  const forward = dx * view.sin + dz * view.cos;
  return [dx * view.cos - dz * view.sin, dy * view.pitchCos + forward * view.pitchSin,
    forward * view.pitchCos - dy * view.pitchSin];
}

function polygon(points, color, seam = false) {
  const near = 0.3;
  if (points.every(point => point[2] < near)) return;
  const side = width / (2 * focal);
  if (points.every(([x, , z]) => x > z * side + 0.1) ||
    points.every(([x, , z]) => x < -z * side - 0.1)) return;
  const clipped = [];
  let previous = points.at(-1);
  for (const current of points) {
    if ((current[2] >= near) !== (previous[2] >= near)) {
      const t = (near - previous[2]) / (current[2] - previous[2]);
      clipped.push([previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t, near]);
    }
    if (current[2] >= near) clipped.push(current);
    previous = current;
  }
  if (clipped.length < 3) return;
  ctx.beginPath();
  for (const [x, y, z] of clipped) ctx.lineTo(width / 2 + x * focal / z, height / 2 - y * focal / z);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // Road strips are adjacent and can show subpixel gaps after projection.
  // Most other faces do not need an outline, so avoid a second draw operation.
  if (seam) {
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

function paint(mesh, seam = false) {
  for (const { points, color, center, radius } of mesh) {
    if (center) {
      const [x, , z] = cameraSpace(center);
      if (z + radius < 0.3 || Math.abs(x) - radius > (z + radius) * width / (2 * focal)) continue;
    }
    polygon(points.map(cameraSpace), color, seam);
  }
}

function box(mesh, place, x, y, z, w, h, d, colors) {
  const points = [[x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d],
    [x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d]].map(place);
  const faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
  for (let i = 0; i < faces.length; i++) {
    mesh.push({ points: faces[i].map(index => points[index]), color: colors[i] ?? colors[0] });
  }
}

function carMesh(car) {
  const spin = car.spinTime > 0 ? tau * (1 - car.spinTime / bananaSpinTime) : 0;
  const sin = Math.sin(car.yaw + car.slip + spin);
  const cos = Math.cos(car.yaw + car.slip + spin);
  const driver = roster[car.character];
  const mesh = [];
  const place = ([x, y, z]) => [car.x + x * cos + z * sin, y, car.z - x * sin + z * cos];
  for (const side of [-1, 1]) {
    for (const axle of [-1, 1]) {
      const rear = axle === -1;
      const wheelYaw = rear ? 0 : car.steering * 0.32;
      const wheelCos = Math.cos(wheelYaw);
      const wheelSin = Math.sin(wheelYaw);
      const radius = rear ? 0.48 : 0.38;
      const tireWidth = rear ? 0.44 : 0.34;
      const wheelPlace = ([x, y, z]) => place([
        side * 1.02 + x * wheelCos + z * wheelSin,
        y + radius,
        axle * 0.98 - x * wheelSin + z * wheelCos,
      ]);
      const inner = wheelRing(wheelPlace, -side * tireWidth / 2, radius);
      const outer = wheelRing(wheelPlace, side * tireWidth / 2, radius);
      const inset = wheelRing(wheelPlace, side * (tireWidth / 2 + 0.006), radius * 0.56);
      const cap = wheelRing(wheelPlace, side * (tireWidth / 2 + 0.012), radius * 0.22);
      for (let i = 0; i < inner.length; i++) {
        const j = (i + 1) % inner.length;
        mesh.push({ points: [inner[i], inner[j], outer[j], outer[i]],
          color: ['#303b41', '#253038', '#19252b'][i % 3] });
        mesh.push({ points: [outer[i], outer[j], inset[j], inset[i]], color: '#242e35' });
        mesh.push({ points: [inset[i], inset[j], cap[j], cap[i]],
          color: i % 2 ? '#738b8d' : '#a1b8b3' });
      }
      mesh.push({ points: inner, color: '#242e35' });
      mesh.push({ points: cap, color: '#bfe96b' });
    }
  }
  const outline = [[-0.56, -1.5], [0.56, -1.5], [0.77, -0.95], [0.73, 0.26],
    [0.46, 1.54], [-0.46, 1.54], [-0.73, 0.26], [-0.77, -0.95]];
  const base = outline.map(([x, z]) => place([x, 0.25, z]));
  const shell = outline.map(([x, z]) => place([x * 0.91, 0.57 + 0.12 * Math.max(0, z), z]));
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    mesh.push({ points: [base[i], base[j], shell[j], shell[i]],
      color: driver.ink });
  }
  mesh.push({ points: shell, color: driver.kart });
  box(mesh, place, -0.12, 0.686, 0.84, 0.24, 0.016, 0.62, ['#bfe96b']);
  box(mesh, place, -0.35, 0.58, -0.67, 0.70, 0.14, 0.69, ['#24343b']);
  box(mesh, place, -0.40, 0.69, -0.70, 0.80, 0.66, 0.22,
    ['#29404b', '#426371', '#3d6470', '#426371', '#538581']);
  box(mesh, place, -0.29, 0.62, 0.36, 0.58, 0.26, 0.23, ['#29404b', '#3d6470', '#3d6470', '#3d6470', '#538581']);
  box(mesh, place, -0.40, 0.86, 0.31, 0.80, 0.07, 0.19, ['#26363d']);
  box(mesh, place, -0.76, 0.28, -1.57, 1.52, 0.13, 0.17, ['#253238']);
  for (const x of [-0.51, 0.38]) {
    box(mesh, place, x, 0.61, -1.35, 0.13, 0.32, 0.19, ['#536e70']);
    box(mesh, place, x, 0.44, -1.51, 0.13, 0.11, 0.13, ['#ff886a']);
  }
  box(mesh, place, -0.83, 0.93, -1.44, 1.66, 0.09, 0.42, ['#2d7571', '#93b652', '#2d7571', '#93b652', '#bfe96b']);
  driverMesh(mesh, place, car, driver);
  return mesh;
}

function ellipsoid(mesh, place, center, radii, shades) {
  const bands = 5;
  const slices = 10;
  const rows = Array.from({ length: bands + 1 }, (_, row) => {
    const latitude = Math.PI * (row / bands - 0.5);
    return Array.from({ length: slices }, (_, i) => {
      const longitude = i * tau / slices;
      return place([
        center[0] + radii[0] * Math.cos(latitude) * Math.cos(longitude),
        center[1] + radii[1] * Math.sin(latitude),
        center[2] + radii[2] * Math.cos(latitude) * Math.sin(longitude),
      ]);
    });
  });
  for (let row = 0; row < bands; row++) {
    for (let i = 0; i < slices; i++) {
      const next = (i + 1) % slices;
      const shade = Math.min(shades.length - 1, Math.floor((row + Number(i < 5)) * shades.length / 6));
      const points = [rows[row][i], rows[row + 1][i], rows[row + 1][next], rows[row][next]];
      if (row === 0) points.pop();
      else if (row === bands - 1) points.splice(2, 1);
      mesh.push({ points, color: shades[shade], cull: true });
    }
  }
}

function driverMesh(mesh, kartPlace, car, driver) {
  const lean = car.steering * 0.16;
  const place = ([x, y, z]) => kartPlace([x + (y - 0.72) * lean, y, z]);
  ellipsoid(mesh, place, [0, 1.10, -0.20], [0.31, 0.39, 0.24], [driver.ink, driver.suit, driver.suit]);
  ellipsoid(mesh, place, [0, 1.36, -0.20], [0.33, 0.10, 0.27], ['#d35e5b', '#ff8c70']);
  driverHead(mesh, place, driver);
  for (const x of [-0.355, 0.355]) {
    ellipsoid(mesh, place, [x * 0.84, 1.06, 0.13], [0.11, 0.12, 0.25], ['#514875', '#8273ac']);
    ellipsoid(mesh, place, [x * 0.92, 0.99, 0.35], [0.095, 0.09, 0.095], ['#d98744', '#ffb55e']);
  }
}

function driverHead(mesh, place, driver) {
  ellipsoid(mesh, place, [0, 1.72, -0.17], [0.41, 0.37, 0.39], [driver.ink, driver.helmet, driver.helmet]);
  for (const [x, y, radius, height] of headDetails(driver.shape)) {
    ellipsoid(mesh, place, [x, 1.72 + y, -0.18], [radius, height, radius],
      [driver.ink, driver.suit, driver.helmet]);
  }
  ellipsoid(mesh, place, [0, 1.73, 0.085], [0.35, 0.168, 0.157], ['#374362', '#414e76', '#7e9fbb']);
  for (const x of [-0.355, 0.355]) {
    ellipsoid(mesh, place, [x, 1.72, -0.20], [0.083, 0.14, 0.12], [driver.ink, driver.suit]);
    ellipsoid(mesh, place, [x * 0.39, 1.745, 0.233], [0.052, 0.038, 0.018], ['#c0d9dc', '#f2f7e6']);
  }
  box(mesh, place, -0.075, 1.60, -0.564, 0.15, 0.21, 0.04, [driver.suit]);
}

function avatar(driver) {
  const mesh = [];
  driverHead(mesh, point => point, driver);
  const faces = mesh.map(({ points, color }) => {
    const depth = points.reduce((sum, [x, , z]) => sum + z * 0.94 + x * 0.34, 0) / points.length;
    const projected = points.map(([x, y, z]) => {
      const horizontal = -x * 0.94 + z * 0.34;
      const vertical = (y - 1.78) * 0.98 - (z * 0.94 + x * 0.34) * 0.19;
      return `${(40 + horizontal * 61).toFixed(1)},${(43 - vertical * 61).toFixed(1)}`;
    }).join(' ');
    return { depth, polygon: `<polygon points="${projected}" fill="${color}" stroke="${color}" stroke-width=".3"/>` };
  });
  faces.sort((a, b) => a.depth - b.depth);
  return `<svg viewBox="0 0 80 78" aria-hidden="true">${faces.map(face => face.polygon).join('')}</svg>`;
}

function wheelRing(place, x, radius) {
  return Array.from({ length: 12 }, (_, i) => {
    const angle = i * tau / 12;
    return place([x, radius * Math.cos(angle), radius * Math.sin(angle)]);
  });
}

function treeMesh({ x, z, h }) {
  const mesh = [];
  const place = ([dx, y, dz]) => [x + dx, y, z + dz];
  box(mesh, place, -0.12, 0, -0.12, 0.24, h * 0.55, 0.24, ['#5b5343']);
  for (let layer = 0; layer < 2; layer++) {
    const r = h * (0.28 - layer * 0.07);
    const y = h * (0.25 + layer * 0.27);
    const top = [x, h * (0.76 + layer * 0.24), z];
    const corners = [[x - r, y, z - r], [x + r, y, z - r], [x + r, y, z + r], [x - r, y, z + r]];
    for (let i = 0; i < 4; i++) {
      mesh.push({ points: [corners[i], corners[(i + 1) % 4], top],
        color: ['#41784b', '#4e8e50', '#69a655', '#51994e'][i] });
    }
  }
  return mesh;
}

const gantry = [];
{
  const [x, , z] = coursePoint(finish);
  const [rightX, , rightZ] = coursePoint(finish, 1);
  const place = ([dx, y, dz]) => [
    x + (rightX - x) * dx - (rightZ - z) * dz, y,
    z + (rightZ - z) * dx + (rightX - x) * dz,
  ];
  const edge = halfRoad + 1.2;
  for (const x of [-edge, edge - 0.7]) {
    box(gantry, place, x, 0, -0.32, 0.7, 5.6, 0.64, ['#a94d44', '#c4614f', '#e67e62']);
    box(gantry, place, x - 0.22, 0, -0.50, 1.14, 0.51, 1.0, ['#4f7086', '#62889b']);
  }
  box(gantry, place, -edge, 4.65, -0.39, edge * 2, 1.7, 0.78, ['#265d76', '#35798d', '#42a6a7']);
  box(gantry, place, -edge, 6.30, -0.43, edge * 2, 0.18, 0.86, ['#f8b45b']);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      box(gantry, place, side * (1.55 + i * 0.61) - 0.23, 5.35, -0.44, 0.46, 0.22, 0.08, ['#a8e0d1']);
    }
  }
  const sun = Array.from({ length: 14 }, (_, i) => {
    const angle = i * tau / 14;
    return place([0.56 * Math.cos(angle), 5.55 + 0.56 * Math.sin(angle), -0.45]);
  });
  gantry.push({ points: sun, color: '#ffd075' });
}

for (const tree of trees) tree.mesh = treeMesh(tree);
for (const face of [...terrain, ...road]) {
  const [a, , b] = face.points;
  face.center = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
  face.radius = Math.max(...face.points.map(([x, , z]) => Math.hypot(x - face.center[0], z - face.center[2])));
}

const walls = wallSegments.map(([[ax, az], [bx, bz]], index) => {
  const x = (ax + bx) / 2;
  const z = (az + bz) / 2;
  const mesh = [
    { points: [[ax, 0, az], [bx, 0, bz], [bx, 1.6, bz], [ax, 1.6, az]], color: '#ead9b5' },
    { points: [[ax, 1.6, az], [bx, 1.6, bz], [bx, 2.05, bz], [ax, 2.05, az]], color: '#347a81' },
  ];
  if (index % 5 === 0) {
    box(mesh, point => [point[0] + x, point[1], point[2] + z], -0.28, 0, -0.28,
      0.56, 2.21, 0.56, ['#dca665', '#d6a36a', '#efbf80']);
  }
  return { x, z, mesh };
});

function drawTurbo(car) {
  const stage = turboStage(car.charge);
  const boosting = car.boostTime > 0;
  if (!stage && !boosting) return;
  const color = boosting ? car.boostColor : stage.color;
  const sin = Math.sin(car.yaw + car.slip);
  const cos = Math.cos(car.yaw + car.slip);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = (car.effectTime * (boosting ? 5.8 : 4.1) + i * 0.618) % 1;
      const x = side * (0.96 + t * 0.35);
      const z = -1.04 - t * (boosting ? 3.8 : 1.3);
      const y = 0.15 + Math.sin(t * Math.PI) * 0.35;
      const size = 0.035 + (1 - t) * 0.095;
      const world = [car.x + x * cos + z * sin, y, car.z - x * sin + z * cos];
      const [px, py, pz] = cameraSpace(world);
      polygon([[px - size, py, pz], [px, py + size, pz], [px + size, py, pz], [px, py - size, pz]], color);
    }
  }
}

const mushroomMesh = [];
ellipsoid(mushroomMesh, point => point, [0, 0.52, 0], [0.34, 0.45, 0.34],
  ['#d2a07a', '#ffe1ac', '#fff3d6']);
ellipsoid(mushroomMesh, point => point, [0, 0.92, 0], [0.81, 0.16, 0.81],
  ['#9e3039', '#c34248', '#ffe6d6']);
ellipsoid(mushroomMesh, point => point, [0, 1.12, 0], [0.82, 0.36, 0.82],
  ['#862339', '#bd313e', '#eb4d50', '#ff7972']);
ellipsoid(mushroomMesh, point => point, [-0.23, 1.41, 0.18], [0.30, 0.08, 0.20],
  ['#ffcebf', '#fff0e6']);

const shellMesh = [];
ellipsoid(shellMesh, point => point, [0, 0.44, 0], [0.78, 0.19, 0.68],
  ['#4a785e', '#e5edc7', '#fff1d6']);
ellipsoid(shellMesh, point => point, [0, 0.6, 0], [0.71, 0.48, 0.61],
  ['#184939', '#287851', '#45b46f', '#83dd83']);
const bananaMesh = [];
ellipsoid(bananaMesh, point => point, [0, 0.38, 0], [0.19, 0.38, 0.19],
  ['#bb8b26', '#ebc638', '#ffed73']);
for (let peel = 0; peel < 3; peel++) {
  const angle = 0.35 + peel * tau / 3;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const place = (width, y, out) => [sin * out + cos * width, y, cos * out - sin * width];
  const base = place(0, 0.69, 0.06);
  const left = place(-0.28, 0.19, 0.45);
  const right = place(0.28, 0.19, 0.45);
  const fold = place(0, 0.30, 0.58);
  const tip = place(0, 0.09, 1.04);
  bananaMesh.push(
    { points: [base, left, fold], color: '#ffe15b' },
    { points: [base, fold, right], color: '#b38922' },
    { points: [left, tip, fold], color: '#e7bf34' },
    { points: [right, fold, tip], color: '#fff08b' },
  );
}

const filmShots = [
  { progress: 0.09, side: -1, height: 7, sweep: 12 },
  { progress: 0.53, side: 1, height: 16, sweep: -11 },
  { progress: 0.33, side: -1, height: 11, sweep: 14 },
  { progress: 0.78, side: 1, height: 23, sweep: -15 },
];

function panCourse(now) {
  const still = reduceMotion.matches;
  if (still && lastFilmDraw !== -Infinity &&
      filmSize === courseFilm.clientWidth + 'x' + courseFilm.clientHeight) return;
  if (now - lastFilmDraw < 34) return;
  lastFilmDraw = now;
  filmSize = courseFilm.clientWidth + 'x' + courseFilm.clientHeight;
  const beat = still ? 0.5 : now / 9400;
  const shot = filmShots[Math.floor(beat) % filmShots.length];
  const phase = beat % 1;
  const t = phase * phase * (3 - 2 * phase);
  const index = Math.round(shot.progress * centerline.length);
  const [targetX, , targetZ] = coursePoint(index + 7);
  const [ax, , az] = coursePoint(index - 13, shot.side * 28);
  const [bx, , bz] = coursePoint(index - 13 + shot.sweep, shot.side * 18);
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  const yaw = Math.atan2(targetX - x, targetZ - z);
  const pitch = Math.atan2(shot.height - 0.5, Math.hypot(targetX - x, targetZ - z));
  courseFilm.style.opacity = still ? 1 : 0.52 + 0.48 * Math.min(1, phase * 14, (1 - phase) * 14);
  draw(null, { x, z, yaw, pitch, height: shot.height });
}
let filmSize = '';

function draw(car, shot) {
  const canvas = car ? car.canvas : courseFilm;
  const camera = car?.camera;
  ctx = car ? car.context : filmContext;
  const dpr = Math.min(devicePixelRatio || 1, !car || cars.length > 1 ? 1.25 : 1.75);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  if (!width || !height) return;
  const pixels = [Math.round(width * dpr), Math.round(height * dpr)];
  if (canvas.width !== pixels[0] || canvas.height !== pixels[1]) {
    [canvas.width, canvas.height] = pixels;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fov = shot ? 46 : chase.fieldOfView + camera.speed * chase.speedWidening;
  focal = height / (2 * Math.tan(fov * Math.PI / 360));
  const distance = shot ? 0 : chase.distance + camera.speed * chase.speedPullback;
  const pitch = shot ? shot.pitch : Math.atan2(chase.height - chase.targetHeight, distance + chase.lookAhead);
  const yaw = shot ? shot.yaw : camera.yaw;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  view = {
    x: shot ? shot.x : camera.x - sin * distance,
    y: shot ? shot.height : chase.height,
    z: shot ? shot.z : camera.z - cos * distance,
    sin, cos, pitchSin: Math.sin(pitch), pitchCos: Math.cos(pitch),
  };

  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  sky.addColorStop(0, '#69bde0');
  sky.addColorStop(1, '#def3e8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const horizon = height / 2 - Math.tan(pitch) * focal;
  for (let layer = 0; layer < 2; layer++) {
    ctx.beginPath();
    const ridge = horizon - height * (0.025 + (1 - layer) * 0.055);
    for (let i = -1; i <= 19; i++) {
      const x = i * width / 18;
      const y = ridge - height * (0.018 + Math.abs(Math.sin(i * 38.71 + layer * 2 + yaw * 2)) * 0.082);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = layer ? '#74aaa0' : '#a8cbd0';
    ctx.fill();
  }
  ctx.fillStyle = '#51aec7';
  ctx.fillRect(0, horizon, width, height);
  paint(terrain);
  paint(road, true);
  const faces = [...gantry];
  if (car) {
    const shadow = Array.from({ length: 14 }, (_, i) => {
      const angle = i * tau / 14;
      return cameraSpace([car.x + Math.cos(angle) * 1.45, 0.01, car.z + Math.sin(angle) * 1.65]);
    });
    polygon(shadow, '#17282d66');
    for (const rival of cars) {
      const [x, , z] = cameraSpace([rival.x, 0, rival.z]);
      if (z < 1 || Math.abs(x) > z * width / (2 * focal) + 3) continue;
      if (rival === car || z < 45) drawTurbo(rival);
      faces.push(...rival.mesh);
    }
    for (const item of pickups.concat(trackItems.shells)) {
      const [x, , z] = cameraSpace([item.x, 0, item.z]);
      if (z < 0.5 || Math.abs(x) > z * width / (2 * focal) + 2.5) continue;
      const banana = item.type === 'banana';
      const bob = banana || item.moving ? 0 : Math.sin(elapsed * 3.8 + item.id) * 0.18;
      const mesh = banana ? bananaMesh : item.type === 'shell' ? shellMesh : mushroomMesh;
      for (const face of mesh) {
        faces.push({ ...face, points: face.points.map(([x, y, z]) => [x + item.x, y + bob, z + item.z]) });
      }
    }
  }
  for (const tree of trees) {
    const [x, , z] = cameraSpace([tree.x, 0, tree.z]);
    if (z > -6 && Math.abs(x) < 1.35 * Math.max(0, z) + 12) faces.push(...tree.mesh);
  }
  for (const wall of walls) {
    const [x, , z] = cameraSpace([wall.x, 0, wall.z]);
    if (z > -4 && z < 170 && Math.abs(x) < z * width / (2 * focal) + 5) faces.push(...wall.mesh);
  }
  const projected = [];
  for (const { points, color, cull } of faces) {
    const transformed = points.map(cameraSpace);
    if (cull) {
      const [a, b, c] = transformed;
      const u = b.map((value, i) => value - a[i]);
      const v = c.map((value, i) => value - a[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2] >= 0) continue;
    }
    const depth = transformed.reduce((sum, point) => sum + point[2], 0) / transformed.length;
    projected.push({ points: transformed, color, depth });
  }
  projected.sort((a, b) => b.depth - a.depth);
  for (const face of projected) polygon(face.points, face.color);
}

function hud() {
  const positions = standings(cars);
  const countdown = elapsed < countdownSeconds ? String(Math.ceil(countdownSeconds - elapsed))
    : elapsed < countdownSeconds + 0.75 ? 'GO!' : '';
  for (const [index, car] of positions.entries()) {
    car.speedLabel.textContent = Math.round(Math.abs(car.speed) * 3.6);
    car.surfaceLabel.textContent = car.surface;
    car.surfaceLabel.style.color = car.surfaceColor;
    if (car.countdownLabel.textContent !== countdown) car.countdownLabel.textContent = countdown;
    car.wrongWayLabel.hidden = car.finishedAt !== null || car.wrongWayTime < 0.45;
    car.shellBadge.hidden = !car.hasShell || car.finishedAt !== null;
    car.raceLabel.textContent = `#${index + 1} · ${car.finishedAt === null ? 'Lap ' + Math.min(3, car.lap + 1) + '/3' : 'Finished'}`;
    const [x, y] = mapPoint(car.x, car.z);
    car.marker.setAttribute('transform', `translate(${Math.max(5, Math.min(115, x))} ${Math.max(5, Math.min(95, y))})`);
  }
  const labels = positions.map(car => `P${car.number} · ${roster[car.character].name}${car.finishedAt !== null ? ' · ' + car.finishedAt.toFixed(2) + ' s' : ''}`);
  if (labels.join('|') !== ranking.dataset.lines) {
    ranking.dataset.lines = labels.join('|');
    ranking.replaceChildren(...labels.map((label, i) => {
      const row = document.createElement('li');
      row.append(seatBadge(positions[i]), document.createTextNode(label.split(' · ').slice(1).join(' · ')));
      return row;
    }));
  }
  ranking.classList.add('places');
  const markers = pickups.map(item => item.id).join(',');
  if (markers !== pickupMarkers) {
    pickupMarkers = markers;
    mapPickups.replaceChildren(...pickups.map(item => {
      const [x, y] = mapPoint(item.x, item.z);
      if (item.type === 'banana') {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        marker.setAttribute('points', `${x},${y - 2.7} ${x + 2.25},${y + 1.75} ${x - 2.25},${y + 1.75}`);
        marker.setAttribute('fill', bananaColor);
        return marker;
      }
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', '2');
      marker.setAttribute('fill', item.type === 'shell' ? shellColor : mushroomColor);
      return marker;
    }));
  }
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.12);
  lastFrame = now;
  if (room.phase === 'racing' && cars.length) {
    const step = 1 / 60;
    pendingTime += dt;
    while (pendingTime >= step) {
      elapsed += step;
      pendingTime -= step;
      if (elapsed > countdownSeconds) {
        const raceTime = elapsed - countdownSeconds;
        const leaderProgress = Math.max(...cars.map(car => car.progress));
        const starts = cars.map(({ x, z }) => [x, z]);
        for (const car of cars) physics(car, step, catchUpFactor(car, leaderProgress, cars.length));
        resolveKartCollisions(cars);
        for (const [index, car] of cars.entries()) {
          advanceProgress(car, ...starts[index], raceTime, step);
          const shot = car.controls.shellShot ?? 0;
          if (car.fireQueued || shot > car.lastShellShot) {
            trackItems.throwShell(car, raceTime);
            car.fireQueued = false;
            car.lastShellShot = shot;
          }
        }
        if (cars.some(car => car.finishedAt === null)) pickups = trackItems.update(raceTime, cars, step);
      }
    }
    for (const car of cars) car.mesh = carMesh(car);
    for (const car of cars) draw(car);
    hud();
  } else {
    panCourse(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
