import { trackList, tracks } from './track.js';
import {
  advanceGlider, advanceProgress, catchUpFactor, countdownSeconds, hitWall, hoverBoostColor, hoverSpinSeconds,
  kartScale, resetProgress, roadTopSpeed,
  resolveKartCollisions, standings, updateWrongWay, wallClearance,
} from './race.js';
import { headDetails, mix, playerColors, roster } from './roster.js';
import { box, buildScene } from './scenery.js';
import { botControls, useBotItem } from './bots.js';
import { createRaceAudio } from './audio.js';
import { createDepthLayer } from './depth.js';
import { bananaSpinTime, createTrackItems, itemInfo, mushroomColor, mushroomTopSpeed } from './track-items.js';

const select = id => document.getElementById(id);
const views = select('views');
const intro = select('race-intro');
const introCanvas = intro.querySelector('canvas');
const introView = { canvas: introCanvas, context: introCanvas.getContext('2d', { alpha: false }) };
const introTitle = select('intro-title');
const countdownLabel = select('race-countdown');
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
const trackLabel = select('track-name');
const trackPicker = select('track-picker');
const soundButton = select('sound');
const audio = createRaceAudio();
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('keydown', () => audio.unlock(), { once: true });
soundButton.addEventListener('click', () => {
  const enabled = audio.toggle();
  soundButton.textContent = enabled ? 'Sound on' : 'Sound off';
  soundButton.setAttribute('aria-pressed', String(enabled));
});

const tau = 2 * Math.PI;
const driftTopSpeed = 24;
const flyoverSeconds = 3.6;
const gridSeconds = 2.1;
const countdownStart = flyoverSeconds + gridSeconds;
const raceStart = countdownStart + countdownSeconds;
const itemChoices = Object.values(itemInfo);
const shellIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="#f3e7d1" d="M4 43c0-7 56-7 56 0v6c0 9-56 9-56 0Z"/><path fill="currentColor" stroke="#ffffff66" stroke-width="2" d="M7 42c0-17 12-30 25-30s25 13 25 30c-8 9-42 9-50 0Z"/><path fill="none" stroke="#19253699" stroke-width="3" d="m32 12-10 14 5 12h10l5-12Zm-10 14L11 30m31-4 11 4M27 38l-8 8m18-8 8 8"/></svg>';
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
let room = { phase: 'menu', mode: 'test', round: 0, players: [], soloPick: 0, track: 'coast' };
let cars = [];
let elapsed = 0;
let rosterSignature = '';
let drawnRound = -1;
let hostRequest = false;
let live = true;
let lastFrame = performance.now();
let pendingTime = 0;
let track = tracks.coast;
let scene = buildScene(track);
let trackItems = createTrackItems(track);
let filmSize = '';
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
  const column = index % 6;
  const row = track.startIndex - Math.floor(index / 6) * 3;
  const [gridX, , gridZ] = track.coursePoint(row, cars.length > 1 ? (column - 2.5) * 2.34 : 0);
  const [aheadX, , aheadZ] = track.coursePoint(row + 1);
  const [centerX, , centerZ] = track.coursePoint(row);
  const yaw = Math.atan2(aheadX - centerX, aheadZ - centerZ);
  const stagger = cars.length > 1 ? (2.5 - column) * 0.56 : 0;
  const x = gridX + Math.sin(yaw) * stagger;
  const z = gridZ + Math.cos(yaw) * stagger;
  Object.assign(car, {
    x, z, yaw, speed: 0, steering: 0, slip: 0, driftDirection: 0, charge: 0,
    boostTime: 0, boostColor: '', spinTime: 0, hoverSpin: 0, hoverSpinDirection: 1,
    flight: null, glider: 0, landingSquash: 0, wheelFold: 0,
    effectTime: 0, surface: 'ON TRACK', surfaceColor: '',
    item: null, roulette: null, itemUses: 0, nextItemUse: 0, boomerangOut: false, botNextUse: 0,
    fireQueued: false, lastShellShot: car.controls.shellShot ?? 0, wallContact: false,
  });
  Object.assign(car.camera, { x, z, lift: 0, yaw: car.yaw, speed: 0 });
  resetProgress(car);
}

function seatColor(player) {
  return player.bot ? mix(roster[player.character].kart, '#ffffff', 0.32) : playerColors[player.number - 1];
}

function createViews(players) {
  elapsed = 0;
  pendingTime = 0;
  trackItems = createTrackItems(track);
  pickupMarkers = '';
  mapPickups.replaceChildren();
  views.replaceChildren();
  mapCars.replaceChildren();
  views.hidden = true;
  intro.hidden = false;
  introTitle.textContent = track.name;
  countdownLabel.textContent = '';
  const humanCount = players.filter(player => !player.bot).length;
  const viewCount = room.mode === 'play' ? 4 : 1;
  views.dataset.count = viewCount;
  const visiblePlayers = new Set([
    ...players.filter(player => !player.bot),
    ...players.filter(player => player.bot).slice(0, viewCount - humanCount),
  ]);
  cars = players.map((player, index) => {
    const car = { ...player, camera: {}, controls: player, audioState: {} };
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circle = document.createElementNS(marker.namespaceURI, 'circle');
    circle.setAttribute('r', player.bot ? '2.7' : '4.1');
    circle.setAttribute('fill', seatColor(player));
    const text = document.createElementNS(marker.namespaceURI, 'text');
    text.textContent = player.number;
    marker.append(circle);
    if (!player.bot) marker.append(text);
    mapCars.append(marker);
    car.marker = marker;
    if (!visiblePlayers.has(player)) return car;
    const panel = document.createElement('article');
    panel.className = 'viewport';
    panel.style.setProperty('--seat', seatColor(player));
    const driverLabel = player.bot ? (humanCount === 3 ? 'Spectator' : 'CPU ' + player.number) : 'P' + player.number;
    panel.innerHTML = `
      <canvas aria-label="Chase camera for ${driverLabel}"></canvas>
      <div class="view-label"><strong>${driverLabel}</strong> ${roster[player.character].short}</div>
      <div class="wrong-way" role="status" hidden>Wrong Way</div>
      <div class="inventory" aria-label="Item slot"></div>
      <div class="race-label"><strong></strong><span></span></div>
      <div class="speed"><strong>0</strong><span>KM/H</span></div>
      <div class="surface">ON TRACK</div>`;
    views.append(panel);
    car.canvas = panel.querySelector('canvas');
    car.context = car.canvas.getContext('2d', { alpha: false });
    car.speedLabel = panel.querySelector('.speed strong');
    car.surfaceLabel = panel.querySelector('.surface');
    car.placeLabel = panel.querySelector('.race-label strong');
    car.lapLabel = panel.querySelector('.race-label span');
    car.inventory = panel.querySelector('.inventory');
    car.wrongWayLabel = panel.querySelector('.wrong-way');
    car.gridSide = index % 2 ? -1 : 1;
    return car;
  });
  cars.forEach(reset);
}
function coursePath(item) {
  return item.centerline.map(([x, , z], i) =>
    (i ? 'L' : 'M') + item.mapPoint(x, z).map(value => value.toFixed(1)).join(' ')).join(' ') + ' Z';
}
function drawMap() {
  document.querySelector('#map-course').setAttribute('d', coursePath(track));
  select('map-walls').setAttribute('d', track.wallSegments.map(segment =>
    segment.map(([x, z], i) => (i ? 'L' : 'M') + track.mapPoint(x, z).map(value => value.toFixed(1)).join(' ')).join(' ')).join(' '));
}
drawMap();

// Swap the whole course (road, walls, scenery, minimap) when the host picks a track.
function useTrack(id) {
  const next = tracks[id] ?? tracks.coast;
  if (next === track) return;
  track = next;
  scene = buildScene(track);
  trackLabel.textContent = track.name.toUpperCase();
  drawMap();
  lastFilmDraw = -Infinity;
  filmSize = '';
}
const driveKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift', 'e']);
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (room.phase !== 'racing' || !driveKeys.has(key) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  if (key === 'e') {
    const driver = cars.find(car => !car.bot && (car.keyboard || car.number === 1));
    if (driver && !event.repeat) driver.fireQueued = true;
    return;
  }
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

async function host(action, extra = {}) {
  if (hostRequest) return;
  hostRequest = true;
  try {
    const response = await fetch('/room', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    updateRoom(await response.json());
  } catch {
    status.lastElementChild.textContent = 'Display disconnected';
  } finally {
    hostRequest = false;
  }
}
for (const [button, action] of [['test-mode', 'test'], ['play-mode', 'play'], ['back', 'menu'], ['start', 'start']]) {
  select(button).addEventListener('click', () => {
    if (action === 'start') {
      audio.unlock();
      if (room.track === 'summit') audio.preloadSummit();
    }
    host(action);
  });
}

const characterCards = roster.map((driver, index) => {
  const button = document.createElement('button');
  button.className = 'character';
  button.type = 'button';
  button.title = `${driver.name} · ${driver.company}`;
  button.innerHTML = `${avatar(driver)}<strong>${driver.name}</strong><em class="company">${driver.company}</em><span class="pick-markers"></span>`;
  button.addEventListener('click', () => {
    if (!room.players.some(player => player.connected)) host('pick', { character: index });
  });
  select('roster').append(button);
  return button;
});

const trackCards = new Map(trackList.map(item => {
  const button = document.createElement('button');
  button.className = 'track-card';
  button.type = 'button';
  button.setAttribute('role', 'radio');
  button.innerHTML = `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="${coursePath(item)}"/></svg>` +
    `<span><strong>${item.name}</strong><em>${item.tagline}</em>` +
    `<small>${Math.round(item.courseLength)} m per lap · 3 laps</small></span>`;
  button.addEventListener('click', () => host('track', { track: item.id }));
  trackPicker.append(button);
  return [item.id, button];
}));

function updateLobby() {
  const players = room.players.filter(player => player.connected);
  const signature = JSON.stringify([room.phase, room.mode, room.soloPick, room.track, players]);
  if (signature === rosterSignature) return;
  rosterSignature = signature;
  status.classList.toggle('connected', players.length > 0);
  status.lastElementChild.textContent = players.length ? `${players.length} / 4 phones joined` : 'Waiting for phones';
  select('seats').replaceChildren(...players.map(player => seatBadge(player)));
  if (room.phase !== 'selection') return;
  for (const [id, button] of trackCards) {
    button.classList.toggle('selected', id === room.track);
    button.setAttribute('aria-checked', String(id === room.track));
  }
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
  badge.style.setProperty('--seat', seatColor(player));
  badge.textContent = `${player.bot ? '#' : 'P'}${player.number}${showReady && player.ready ? ' ✓' : ''}`;
  return badge;
}
function updateRoom(state) {
  if (!state?.players) return;
  room = state;
  live = true;
  useTrack(room.track);
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
  const keyboard = !car.bot && (car.keyboard || car.number === 1);
  const keyboardSteer = keyboard ? down('d', 'arrowright') - down('a', 'arrowleft') : 0;
  const keyboardThrottle = keyboard ? down('w', 'arrowup') - down('s', 'arrowdown') : 0;
  const road = track.nearestRoad(car.x, car.z);
  const phone = car.bot ? botControls(track, car, road, pace) : car.controls;
  const spinning = car.spinTime > 0;
  const finished = car.finishedAt !== null;
  const inputAvailable = car.bot || live;
  const steer = spinning ? 0 : keyboardSteer || (inputAvailable && phone.steer) || 0;
  const canDrive = !finished && !spinning;
  const requestedThrottle = canDrive ? keyboardThrottle || (inputAvailable && phone.throttle) || 0 : 0;
  const driftButton = !spinning && keyboardThrottle === 0 && inputAvailable && phone.brake;
  const keyboardDrift = keyboard && keys.has('shift');
  const reverseFromStop = canDrive && (driftButton || keyboardDrift) && requestedThrottle === 0 && car.speed <= 0;
  const throttle = reverseFromStop ? -1 : requestedThrottle;
  const brake = finished || driftButton;
  const { distance } = road;
  const hover = track.elevated ? track.profile(car.z, car.x).hover : 0;
  car.wheelFold += (hover - car.wheelFold) * (1 - Math.exp(-7 * dt));
  const onRoad = distance < track.widthAt(road.index) + 0.45;
  const driftHeld = throttle > 0 && (driftButton || keyboardDrift);
  const canDrift = onRoad && !car.flight && car.speed > 7;
  if (car.driftDirection && (!driftHeld || !canDrift || !canDrive)) {
    const turbo = turboStage(car.charge);
    if (!driftHeld && canDrift && throttle > 0 && turbo) {
      car.boostTime = turbo.duration;
      car.boostColor = turbo.color;
      car.speed = Math.max(car.speed, 25);
    }
    car.driftDirection = 0;
    car.charge = 0;
  }
  if (canDrive && !car.driftDirection && driftHeld && canDrift && Math.abs(steer) > 0.17) {
    car.driftDirection = Math.sign(steer);
    // Rotate the visual body immediately, without changing its travel heading.
    car.slip = car.driftDirection * 0.40;
  }
  const drifting = car.driftDirection !== 0;
  if (drifting) car.charge += dt * (0.78 + Math.max(0, steer * car.driftDirection) * 0.62);
  const hoverBoost = hover >= 0.5 && car.boostColor === hoverBoostColor;
  car.boostTime = onRoad || hoverBoost ? Math.max(0, car.boostTime - dt) : 0;
  car.effectTime += dt;
  const boosting = car.boostTime > 0;
  const mushroom = boosting && car.boostColor === mushroomColor;
  const boostedTopSpeed = mushroom ? mushroomTopSpeed : 31;
  const onRoadSpeed = drifting ? driftTopSpeed : boosting ? boostedTopSpeed : roadTopSpeed * pace;
  const maxSpeed = onRoad || (hoverBoost && boosting) ? onRoadSpeed : 17;
  car.steering += (steer - car.steering) * (1 - Math.exp(-12 * dt));
  if (car.flight) {
    // Airspeed comes from the glider, independent of the ground pedals.
    car.speed = Math.max(20, car.speed);
  } else if (brake && throttle === 0) {
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
  if (!car.flight && car.speed > maxSpeed) car.speed = Math.max(maxSpeed, car.speed - (onRoad ? 34 : 15) * dt);
  car.speed = Math.max(-6, drifting ? Math.min(driftTopSpeed, car.speed) : car.speed);
  const grip = 1 - Math.exp(-(drifting ? 7 : 9) * dt);
  const driftSteer = car.steering * car.driftDirection;
  const slip = car.driftDirection * (0.40 + 0.14 * driftSteer);
  car.slip += (slip - car.slip) * grip;
  const movingTurnRate = car.speed / (3.8 + Math.abs(car.speed) * 0.42);
  const turnRate = car.wallContact && throttle ? Math.sign(car.speed || throttle) *
    Math.max(0.85, Math.abs(movingTurnRate)) : movingTurnRate;
  const turnInput = drifting ? car.driftDirection * (0.10 + driftSteer * 1.28) : car.steering;
  if (!spinning) car.yaw += turnInput * turnRate * (car.flight ? 0.53 : 1) * dt;
  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;
  const wall = distance + Math.abs(car.speed) * dt > wallClearance && hitWall(track, car, previousX, previousZ);
  advanceGlider(track, car, previousX, dt, inputAvailable ? phone.pitch ?? 0 : 0);
  car.wallContact = wall;
  updateWrongWay(car, road, dt);
  const following = 1 - Math.exp(-8 * dt);
  camera.x += (car.x - camera.x) * following;
  camera.z += (car.z - camera.z) * following;
  const flightLift = car.flight ? car.flight.y - track.profile(camera.z, camera.x).y : 0;
  camera.lift += (flightLift - camera.lift) * (1 - Math.exp(-14 * dt));
  camera.yaw += (car.yaw - camera.yaw) * (1 - Math.exp(-5 * dt));
  camera.speed += (Math.min(1.25, Math.max(0, car.speed / roadTopSpeed)) - camera.speed) * following;
  const stage = drifting && turboStage(car.charge);
  car.spinTime = Math.max(0, car.spinTime - dt);
  car.hoverSpin = Math.max(0, car.hoverSpin - dt);
  car.surface = car.flight ? (car.flight.time > 0.26 ? 'GLIDING' : 'AIRBORNE') : spinning ? car.spinLabel : wall ? 'WALL' :
    boosting ? (mushroom ? 'MUSHROOM BOOST' : car.boostColor === hoverBoostColor ? 'HOVER BOOST' : 'TURBO') :
    stage ? 'TURBO READY' :
    drifting ? 'DRIFTING' : car.speed < -0.2 ? 'REVERSING' : hover >= 0.5 ? 'HOVER MODE' : onRoad ? 'ON TRACK' : 'OFF ROAD';
  car.surfaceColor = spinning ? car.spinColor : wall ? '#ffc29f' : boosting ? car.boostColor : stage ? stage.color : '';
}

let view;
let halfWidth, halfHeight, frustumSide, frustumNormal;
const near = 0.3;
const projected = [];
const projectionPool = [];
const flatFace = [];
let depthLayer;
let depthInitialized = false;

function cameraSpace([x, y, z], output = [0, 0, 0]) {
  const dx = x - view.x;
  const dz = z - view.z;
  const dy = y - view.y;
  output[0] = dx * view.rx + dy * view.ry + dz * view.rz;
  output[1] = dx * view.ux + dy * view.uy + dz * view.uz;
  output[2] = dx * view.fx + dy * view.fy + dz * view.fz;
  return output;
}

function surfaceOffset(x, surface, right, up, ahead) {
  return [x + right, surface.y + up * surface.cos + ahead * surface.sin,
    surface.z - up * surface.sin + ahead * surface.cos];
}

function orientCamera(x, y, z, yaw, pitch, surfaceSin = 0, surfaceCos = 1) {
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const fy = cos * surfaceSin;
  const fz = cos * surfaceCos;
  return {
    x, y, z,
    rx: cos, ry: -sin * surfaceSin, rz: -sin * surfaceCos,
    ux: sin * sp, uy: fy * sp + surfaceCos * cp, uz: fz * sp - surfaceSin * cp,
    fx: sin * cp, fy: fy * cp - surfaceCos * sp, fz: fz * cp + surfaceSin * sp,
  };
}

function projectFace(points, output) {
  output.length = points.length;
  for (let i = 0; i < points.length; i++) cameraSpace(points[i], output[i] ??= [0, 0, 0]);
}

function visibleFace(points) {
  let inFront = false;
  let insideLeft = false;
  let insideRight = false;
  for (const [x, , z] of points) {
    const edge = z * frustumSide + 0.1;
    inFront ||= z >= near;
    insideLeft ||= x >= -edge;
    insideRight ||= x <= edge;
    if (inFront && insideLeft && insideRight) return true;
  }
  return false;
}

function polygon(points, color, seam = false) {
  if (visibleFace(points)) paintPolygon(points, color, seam);
}

function paintPolygon(points, color, seam = false) {
  ctx.beginPath();
  let previous = points.at(-1);
  for (const current of points) {
    const [x, y, z] = current;
    const [px, py, pz] = previous;
    if ((z >= near) !== (pz >= near)) {
      const t = (near - pz) / (z - pz);
      const scale = focal / near;
      ctx.lineTo(halfWidth + (px + (x - px) * t) * scale, halfHeight - (py + (y - py) * t) * scale);
    }
    if (z >= near) {
      const scale = focal / z;
      ctx.lineTo(halfWidth + x * scale, halfHeight - y * scale);
    }
    previous = current;
  }
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

function visitVisibleFaces(mesh, visit) {
  const location = [0, 0, 0];
  const inView = (center, radius) => {
    const [x, , z] = cameraSpace(center, location);
    return z + radius >= near && Math.abs(x) <= z * frustumSide + radius * frustumNormal + 0.1;
  };
  for (const group of mesh) {
    if (!inView(group.center, group.radius)) continue;
    for (const face of group.faces) {
      const { center, radius } = face;
      if (!inView(center, radius)) continue;
      visit(face);
    }
  }
}

function paint(mesh, seam = false) {
  visitVisibleFaces(mesh, ({ points, color }) => {
    projectFace(points, flatFace);
    polygon(flatFace, color, seam);
  });
}

function queueFace({ points, color, cull }) {
  const entry = projectionPool[projected.length] ??= { points: [] };
  const transformed = entry.points;
  projectFace(points, transformed);
  if (!visibleFace(transformed)) return;
  if (cull) {
    const [a, b, c] = transformed;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * a[0] + (uz * vx - ux * vz) * a[1] + (ux * vy - uy * vx) * a[2] >= 0) return;
  }
  entry.color = color;
  projected.push(entry);
}

function carMesh(car) {
  const spin = car.spinTime > 0 ? tau * (1 - car.spinTime / bananaSpinTime) :
    car.hoverSpin > 0 ? car.hoverSpinDirection * tau * (1 - car.hoverSpin / hoverSpinSeconds) : 0;
  const sin = Math.sin(car.yaw + car.slip + spin);
  const cos = Math.cos(car.yaw + car.slip + spin);
  const driver = roster[car.character];
  const mesh = [];
  const surface = track.profile(car.z, car.x);
  if (car.flight) surface.y = car.flight.y;
  const hover = car.wheelFold;
  const hoverLift = hover * (0.19 + 0.035 * Math.sin(car.effectTime * 7));
  const pitch = car.flight ? Math.atan2(car.flight.rise, Math.max(1, car.speed)) * 0.77 + car.flight.pitch * 0.22 :
    Math.atan((surface.slopeX ?? 0) * sin);
  const pitchSin = Math.sin(pitch), pitchCos = Math.cos(pitch);
  const place = ([x, y, z]) => {
    const ahead = z * pitchCos - y * pitchSin;
    const up = y * pitchCos + z * pitchSin;
    return surfaceOffset(car.x, surface, kartScale * (x * cos + ahead * sin),
      (up * (1 - 0.14 * car.landingSquash) + hoverLift) * kartScale, kartScale * (ahead * cos - x * sin));
  };
  const wheelTilt = hover * Math.PI / 2;
  const tiltSin = Math.sin(wheelTilt);
  const tiltCos = Math.cos(wheelTilt);
  if (car.glider > 0.015) {
    const deployment = car.glider;
    const mast = 1.85 + 1.4 * deployment;
    box(mesh, place, -0.065, 1.15, -0.5, 0.13, mast - 1.15, 0.13, ['#b9d2dc']);
    for (const side of [-1, 1]) {
      const tip = [side * (0.2 + 4.0 * deployment), mast - 0.4 * deployment, -1.36];
      const ridge = [0, mast + 0.36 * deployment, 0.46];
      const tail = [0, mast - 0.14, -1.63];
      mesh.push({ points: [tip, ridge, tail].map(place), color: side < 0 ? driver.kart : driver.accent });
      mesh.push({ points: [tip, tail, [side * 0.62 * deployment, mast + 0.16, -0.3]].map(place), color: '#c9f4ee' });
    }
  }
  for (const side of [-1, 1]) {
    for (const axle of [-1, 1]) {
      const rear = axle === -1;
      const wheelYaw = rear ? 0 : car.steering * 0.32 * (1 - hover);
      const wheelCos = Math.cos(wheelYaw);
      const wheelSin = Math.sin(wheelYaw);
      const radius = rear ? 0.48 : 0.38;
      const tireWidth = rear ? 0.44 : 0.34;
      const wheelPlace = ([x, y, z]) => {
        const across = x * tiltCos - y * tiltSin * side;
        const up = x * tiltSin * side + y * tiltCos;
        return place([side * (1.02 + 0.22 * hover) + across * wheelCos + z * wheelSin,
          up + radius, axle * 0.98 - across * wheelSin + z * wheelCos]);
      };
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
      mesh.push({ points: cap, color: hover > 0.55 ? '#7af6f2' : driver.accent });
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
  box(mesh, place, -0.12, 0.686, 0.84, 0.24, 0.016, 0.62, [driver.accent]);
  box(mesh, place, -0.35, 0.58, -0.67, 0.70, 0.14, 0.69, ['#24343b']);
  box(mesh, place, -0.40, 0.69, -0.70, 0.80, 0.66, 0.22,
    ['#29404b', '#426371', '#3d6470', '#426371', '#538581']);
  box(mesh, place, -0.29, 0.62, 0.36, 0.58, 0.26, 0.23, ['#29404b', '#3d6470', '#3d6470', '#3d6470', '#538581']);
  box(mesh, place, -0.40, 0.86, 0.31, 0.80, 0.07, 0.19, ['#26363d']);
  box(mesh, place, -0.76, 0.28, -1.57, 1.52, 0.13, 0.17, ['#253238']);
  for (const x of [-0.51, 0.38]) box(mesh, place, x, 0.44, -1.51, 0.13, 0.11, 0.13, ['#ff886a']);
  wingMesh(mesh, place, driver);
  driverMesh(mesh, place, car, driver);
  if (car.item === 'green' && car.finishedAt === null) {
    const hover = 0.34 + 0.12 * Math.sin(car.effectTime * 5);
    for (const face of shellMesh) {
      mesh.push({ ...face, points: face.points.map(([x, y, z]) => place([
        x * 0.8, y * 0.8 + hover, z * 0.8 - 2.65,
      ])) });
    }
  }
  return mesh;
}

// Each model gets its own rear wing: a slim blade, a wide plane, a tall wing with
// end plates, a stacked twin, or none at all with a low diffuser instead.
function wingMesh(mesh, place, driver) {
  const body = mix(driver.kart, '#000000', 0.28);
  const colors = [body, driver.accent, body, driver.accent, driver.accent];
  const planes = {
    slim: [[1.5, 0.95, 0.30]], wide: [[1.9, 0.93, 0.42]], tall: [[1.55, 1.15, 0.36]],
    twin: [[1.6, 0.88, 0.28], [1.6, 1.10, 0.28]], none: [],
  }[driver.wing];
  const top = Math.max(0, ...planes.map(([, y]) => y));
  if (top) for (const x of [-0.51, 0.38]) box(mesh, place, x, 0.61, -1.35, 0.13, top - 0.58, 0.19, ['#536e70']);
  for (const [width, y, depth] of planes) box(mesh, place, -width / 2, y, -1.44 - (depth - 0.42) / 2, width, 0.09, depth, colors);
  if (driver.wing === 'tall') for (const side of [-1, 1]) box(mesh, place, side * 0.82 - 0.04, 0.95, -1.45, 0.08, 0.42, 0.4, [driver.accent]);
  if (driver.wing === 'none') box(mesh, place, -0.82, 0.34, -1.64, 1.64, 0.16, 0.26, [driver.accent]);
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
  ellipsoid(mesh, place, [0, 1.36, -0.20], [0.33, 0.10, 0.27], [mix(driver.accent, driver.ink, 0.45), driver.accent]);
  driverHead(mesh, place, driver);
  for (const x of [-0.355, 0.355]) {
    ellipsoid(mesh, place, [x * 0.84, 1.06, 0.13], [0.11, 0.12, 0.25], [driver.ink, mix(driver.suit, '#ffffff', 0.14)]);
    ellipsoid(mesh, place, [x * 0.92, 0.99, 0.35], [0.095, 0.09, 0.095], [mix(driver.accent, driver.ink, 0.3), driver.accent]);
  }
}

function driverHead(mesh, place, driver) {
  ellipsoid(mesh, place, [0, 1.72, -0.17], [0.41, 0.37, 0.39], [driver.ink, driver.helmet, driver.helmet]);
  for (const [x, y, radius, height] of headDetails(driver.shape)) {
    ellipsoid(mesh, place, [x, 1.72 + y, -0.18], [radius, height, radius],
      [driver.ink, driver.suit, driver.helmet]);
  }
  ellipsoid(mesh, place, [0, 1.73, 0.085], [0.35, 0.168, 0.157], [driver.visor, mix(driver.visor, '#ffffff', 0.18), mix(driver.visor, '#ffffff', 0.55)]);
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

function drawTurbo(car) {
  const stage = turboStage(car.charge);
  const boosting = car.boostTime > 0;
  if (!stage && !boosting) return;
  const color = boosting ? car.boostColor : stage.color;
  const sin = Math.sin(car.yaw + car.slip);
  const cos = Math.cos(car.yaw + car.slip);
  const surface = track.profile(car.z, car.x);
  if (car.flight) surface.y = car.flight.y;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = (car.effectTime * (boosting ? 5.8 : 4.1) + i * 0.618) % 1;
      const x = side * (0.96 + t * 0.35);
      const z = -1.04 - t * (boosting ? 3.8 : 1.3);
      const y = 0.15 + Math.sin(t * Math.PI) * 0.35;
      const size = 0.035 + (1 - t) * 0.095;
      const world = surfaceOffset(car.x, surface, kartScale * (x * cos + z * sin),
        y * kartScale, kartScale * (z * cos - x * sin));
      const [px, py, pz] = cameraSpace(world);
      const points = [[px - size, py, pz], [px, py + size, pz], [px + size, py, pz], [px, py - size, pz]];
      if (track.elevated) {
        if (!visibleFace(points)) continue;
        const entry = projectionPool[projected.length] ??= { points: [] };
        entry.points.length = points.length;
        for (let j = 0; j < points.length; j++) {
          const point = entry.points[j] ??= [0, 0, 0];
          [point[0], point[1], point[2]] = points[j];
        }
        entry.color = color;
        projected.push(entry);
      } else polygon(points, color);
    }
  }
}

const shellMesh = [];
ellipsoid(shellMesh, point => point, [0, 0.44, 0], [0.78, 0.19, 0.68],
  ['#42674b', '#e5edc7', '#fff1d6']);
ellipsoid(shellMesh, point => point, [0, 0.6, 0], [0.71, 0.48, 0.61],
  ['#226442', '#2ca849', '#77e45b', '#b6ff93']);
const itemMeshes = { green: shellMesh };
for (const [type, shades] of [
  ['red', ['#6d1930', '#d62b46', '#ff6b72', '#ffb49f']],
  ['blue', ['#1b387a', '#325cd7', '#6e9cff', '#d4eeff']],
]) {
  itemMeshes[type] = shellMesh.slice(0, shellMesh.length / 2);
  ellipsoid(itemMeshes[type], point => point, [0, 0.6, 0], [0.71, 0.48, 0.61], shades);
}
itemMeshes.fire = [];
ellipsoid(itemMeshes.fire, point => point, [0, 0.68, 0], [0.48, 0.48, 0.48],
  ['#8d2428', '#dc4532', '#fa851d', '#ffdb52']);
itemMeshes.bomb = [];
ellipsoid(itemMeshes.bomb, point => point, [0, 0.78, 0], [0.62, 0.63, 0.62],
  ['#182036', '#28324e', '#465879']);
box(itemMeshes.bomb, point => point, -0.08, 1.32, -0.08, 0.16, 0.26, 0.16, ['#fbb351']);
for (const x of [-0.46, 0.16]) {
  box(itemMeshes.bomb, point => point, x, 0, -0.25, 0.3, 0.21, 0.5, ['#e2a44f']);
}
itemMeshes.boomerang = [
  { points: [[-0.83, 0.8, 0.53], [0, 0.8, -0.38], [0.83, 0.8, 0.53], [0, 0.8, 0.04]], color: '#ffbb71' },
  { points: [[-0.83, 0.62, 0.53], [0, 0.62, -0.38], [0.83, 0.62, 0.53], [0, 0.62, 0.04]], color: '#b76a4d' },
];
const itemBoxMesh = [];
box(itemBoxMesh, point => point, -0.86, -0.86, -0.86, 1.72, 1.72, 1.72,
  ['#4366c8', '#7d80ff', '#93e8ff', '#6489e5', '#bdf6ff']);
const boxGlyph = [[-0.29, 0.29, 0.58, 0.15], [0.14, 0.02, 0.15, 0.27],
  [-0.14, -0.12, 0.43, 0.14], [-0.14, -0.31, 0.15, 0.2], [-0.14, -0.55, 0.15, 0.14]];
for (let side = 0; side < 4; side++) {
  const angle = side * Math.PI / 2;
  const place = (x, y) => [x * Math.cos(angle) + 0.87 * Math.sin(angle), y,
    -x * Math.sin(angle) + 0.87 * Math.cos(angle)];
  for (const [x, y, w, h] of boxGlyph) {
    itemBoxMesh.push({ points: [place(x, y), place(x + w, y), place(x + w, y + h), place(x, y + h)],
      color: '#f3ffff' });
  }
}

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

itemMeshes.banana = bananaMesh;

const smooth = t => t * t * (3 - 2 * t);

function courseShot(shot, t) {
  const index = Math.round(shot.progress * track.centerline.length);
  const point = (i, offset) => {
    const [x, , z] = track.coursePoint(i, offset);
    return track.surfacePoint(x, z);
  };
  const [targetX, targetY, targetZ] = point(index + 7, 0);
  const [ax, ay, az] = point(index - 13, shot.side * 28);
  const [bx, by, bz] = point(index - 13 + shot.sweep, shot.side * 18);
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  const height = Math.max(targetY * 0.65, ay + (by - ay) * t) + shot.height;
  const yaw = Math.atan2(targetX - x, targetZ - z);
  const pitch = Math.atan2(height - targetY - 0.5, Math.hypot(targetX - x, targetZ - z));
  return { x, z, yaw, pitch, height };
}

function panCourse(now) {
  const still = reduceMotion.matches;
  if (still && lastFilmDraw !== -Infinity &&
      filmSize === courseFilm.clientWidth + 'x' + courseFilm.clientHeight) return;
  if (now - lastFilmDraw < 34) return;
  lastFilmDraw = now;
  filmSize = courseFilm.clientWidth + 'x' + courseFilm.clientHeight;
  const beat = still ? 0.5 : now / 9400;
  const shot = scene.filmShots[Math.floor(beat) % scene.filmShots.length];
  const phase = beat % 1;
  courseFilm.style.opacity = still ? 1 : 0.52 + 0.48 * Math.min(1, phase * 14, (1 - phase) * 14);
  draw(null, courseShot(shot, smooth(phase)));
}

function gridCamera(car) {
  const t = smooth(Math.min(1, (elapsed - flyoverSeconds) / gridSeconds));
  const bearing = car.yaw + (1 - t) * car.gridSide * 0.93;
  const distance = chase.distance + (1 - t) * 11;
  const height = chase.height + (1 - t) * 5;
  const x = car.x - Math.sin(bearing) * distance;
  const z = car.z - Math.cos(bearing) * distance;
  const targetX = car.x + Math.sin(car.yaw) * chase.lookAhead;
  const targetZ = car.z + Math.cos(car.yaw) * chase.lookAhead;
  const yaw = Math.atan2(targetX - x, targetZ - z);
  const pitch = Math.atan2(height - chase.targetHeight, Math.hypot(targetX - x, targetZ - z));
  return { x, z, yaw, pitch, height, fov: chase.fieldOfView + (1 - t) * 7 };
}

function draw(car, shot, externalView) {
  const target = car ?? externalView;
  const canvas = target?.canvas ?? courseFilm;
  const camera = car?.camera;
  ctx = target?.context ?? filmContext;
  const split = car && room.mode === 'play';
  const dpr = Math.min(devicePixelRatio || 1, split ? 1 : !car ? 1.25 : 1.75);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  if (!width || !height) return;
  const pixels = [Math.round(width * dpr), Math.round(height * dpr)];
  if (canvas.width !== pixels[0] || canvas.height !== pixels[1]) {
    [canvas.width, canvas.height] = pixels;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const fov = shot ? shot.fov ?? 46 : chase.fieldOfView + camera.speed * chase.speedWidening;
  focal = height / (2 * Math.tan(fov * Math.PI / 360));
  halfWidth = width / 2;
  halfHeight = height / 2;
  frustumSide = halfWidth / focal;
  frustumNormal = Math.hypot(1, frustumSide);
  const distance = shot ? 0 : chase.distance + camera.speed * chase.speedPullback;
  const pitch = shot ? shot.pitch : Math.atan2(chase.height - chase.targetHeight, distance + chase.lookAhead);
  const yaw = shot ? shot.yaw : camera.yaw;
  if (shot) {
    view = orientCamera(shot.x, shot.height, shot.z, yaw, pitch);
  } else {
    const surface = track.profile(camera.z, camera.x);
    surface.y += camera.lift;
    const carSurface = track.profile(car.z, car.x);
    if (track.elevated && !car.flight && Math.abs(camera.lift) < 0.15) {
      const behindX = camera.x - Math.sin(yaw) * distance;
      const behindZ = camera.z - Math.cos(yaw) * distance;
      const [x, y, z] = track.surfacePoint(behindX, behindZ, chase.height);
      const [aimX, aimY, aimZ] = surfaceOffset(car.x, carSurface,
        Math.sin(yaw) * chase.lookAhead, chase.targetHeight, Math.cos(yaw) * chase.lookAhead);
      const dx = aimX - x, dy = aimY - y, dz = aimZ - z;
      const forward = dy * carSurface.sin + dz * carSurface.cos;
      const normal = dy * carSurface.cos - dz * carSurface.sin;
      view = orientCamera(x, y, z, Math.atan2(dx, forward),
        Math.atan2(-normal, Math.hypot(dx, forward)), carSurface.sin, carSurface.cos);
    } else {
      const [x, y, z] = surfaceOffset(camera.x, { ...surface, sin: carSurface.sin, cos: carSurface.cos },
        -Math.sin(yaw) * distance, chase.height, -Math.cos(yaw) * distance);
      view = orientCamera(x, y, z, yaw, pitch, carSurface.sin, carSurface.cos);
    }
  }

  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.4);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const horizon = view.uy > 0.05 ? Math.max(-height, Math.min(height * 2, halfHeight + view.fy / view.uy * focal))
    : view.fy > 0 ? height * 2 : -height;
  for (let layer = 0; layer < 2; layer++) {
    ctx.beginPath();
    const ridge = horizon - height * scene.ridgeScale * (0.025 + (1 - layer) * 0.055);
    for (let i = -1; i <= 19; i++) {
      const x = i * width / 18;
      const y = ridge - height * scene.ridgeScale * (0.018 + Math.abs(Math.sin(i * 38.71 + layer * 2 + yaw * 2)) * 0.082);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = layer ? scene.ridge[1] : scene.ridge[0];
    ctx.fill();
  }
  ctx.fillStyle = scene.ground;
  if (horizon < height) ctx.fillRect(0, horizon, width, height - horizon);
  const location = [0, 0, 0];
  projected.length = 0;
  if (track.elevated && !depthInitialized) {
    depthInitialized = true;
    try { depthLayer = createDepthLayer(); } catch { depthLayer = null; }
  }
  if (track.elevated) visitVisibleFaces(scene.terrain, queueFace);
  else paint(scene.terrain);
  for (const support of scene.supports ?? []) {
    const [x, , z] = cameraSpace([support.x, support.y, support.z], location);
    if (z > -support.pad && z < support.range && Math.abs(x) < Math.max(0, z) * frustumSide + support.pad) {
      for (const face of support.mesh) queueFace(face);
    }
  }
  if (track.elevated) visitVisibleFaces(scene.road, queueFace);
  else paint(scene.road, true);
  const faces = [...scene.gantry];
  if (car && !car.flight && !track.elevated) {
    const surface = track.profile(car.z, car.x);
    const shadow = Array.from({ length: 14 }, (_, i) => {
      const angle = i * tau / 14;
      return cameraSpace(surfaceOffset(car.x, surface, Math.cos(angle) * 1.45 * kartScale, 0.025,
        Math.sin(angle) * 1.65 * kartScale));
    });
    polygon(shadow, '#17282d66');
  }
  if (target) {
    for (const rival of cars) {
      const position = track.surfacePoint(rival.x, rival.z);
      if (rival.flight) position[1] = rival.flight.y;
      const [x, , z] = cameraSpace(position, location);
      if (z < 1 || z > 104 || Math.abs(x) > z * frustumSide + 3) continue;
      if (rival === car || z < 45) drawTurbo(rival);
      faces.push(...(rival.mesh ??= carMesh(rival)));
    }
    const raceTime = elapsed - raceStart;
    for (const item of [...trackItems.boxes, ...trackItems.objects]) {
      if (item.type === 'box' && item.availableAt > raceTime && item.availableAt > 0) continue;
      const surface = track.profile(item.z, item.x);
      const [x, , z] = cameraSpace([item.x, surface.y, surface.z], location);
      if (z < 0.5 || z > 90 || Math.abs(x) > z * frustumSide + 2.5) continue;
      const floating = item.type === 'box';
      const angle = floating ? elapsed * 1.6 + item.id : item.type === 'boomerang' ? elapsed * 18 : 0;
      const lift = floating ? 1.48 + Math.sin(elapsed * 3.8 + item.id) * 0.18 :
        item.type === 'banana' && raceTime < item.landAt ? Math.sin(Math.PI * (item.landAt - raceTime) / 0.52) * 1.4 :
        item.type === 'blue' ? 0.6 : 0;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      for (const face of floating ? itemBoxMesh : itemMeshes[item.type]) {
        faces.push({ ...face, points: face.points.map(([a, y, b]) =>
          surfaceOffset(item.x, surface, a * cos + b * sin, y + lift, b * cos - a * sin)) });
      }
    }
    for (const wave of trackItems.effects) {
      const radius = wave.radius * (0.28 + (raceTime - wave.born) * 1.8);
      const surface = track.profile(wave.z, wave.x);
      const point = (i, r) => surfaceOffset(wave.x, surface,
        r * Math.sin(i * tau / 18), 0.21, r * Math.cos(i * tau / 18));
      for (let i = 0; i < 18; i++) {
        faces.push({ points: [point(i, radius), point(i + 1, radius), point(i + 1, radius - 0.26),
          point(i, radius - 0.26)], color: wave.color });
      }
    }
  }
  for (const tree of scene.trees) {
    const [x, , z] = cameraSpace([tree.x, 0, tree.z], location);
    if (z > -6 && Math.abs(x) < 1.35 * Math.max(0, z) + 12) faces.push(...tree.mesh);
  }
  for (const prop of scene.props) {
    const [x, , z] = cameraSpace([prop.x, prop.y ?? 0, prop.z], location);
    if (z > -4 && z < prop.range && Math.abs(x) < z * frustumSide + prop.pad) faces.push(...prop.mesh);
  }
  for (const face of faces) queueFace(face);
  if (track.elevated && depthLayer?.draw(projected, width, height, focal, ctx, pixels)) return;
  for (const face of projected) {
    let depth = 0;
    for (const point of face.points) depth += point[2];
    face.depth = depth / face.points.length;
  }
  projected.sort((a, b) => b.depth - a.depth);
  for (const face of projected) paintPolygon(face.points, face.color);
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function hud() {
  const positions = standings(cars);
  for (const [index, car] of positions.entries()) {
    if (car.canvas) {
      setText(car.speedLabel, String(Math.round(Math.abs(car.speed) * 3.6)));
      setText(car.surfaceLabel, car.surface);
      if (car.hudColor !== car.surfaceColor) {
        car.hudColor = car.surfaceColor;
        car.surfaceLabel.style.color = car.surfaceColor;
      }
      const hideWarning = car.finishedAt !== null || car.wrongWayTime < 0.45;
      if (car.wrongWayLabel.hidden !== hideWarning) car.wrongWayLabel.hidden = hideWarning;
      setText(car.placeLabel, (index + 1) + (['st', 'nd', 'rd'][index] ?? 'th'));
      setText(car.lapLabel, car.finishedAt === null ? 'Lap ' + Math.min(3, car.lap + 1) + '/3' : 'Finished');
      const roulette = car.roulette;
      const badge = roulette ? itemChoices[Math.floor(Math.max(0, elapsed - raceStart - roulette.start) * 12) % itemChoices.length] :
        itemInfo[car.item];
      const label = car.finishedAt !== null ? '' : badge?.label ?? '';
      if (car.inventory.dataset.item !== label) {
        car.inventory.dataset.item = label;
        car.inventory.innerHTML = !label ? '' : badge.icon === '◆' ? shellIcon : badge.icon;
        car.inventory.style.setProperty('--item-color', label ? badge.color : '');
        car.inventory.setAttribute('aria-label', label || 'Empty item slot');
      }
    }
    const [x, y] = track.mapPoint(car.x, car.z);
    const transform = `translate(${Math.max(5, Math.min(115, x))} ${Math.max(5, Math.min(95, y))})`;
    if (car.markerPosition !== transform) {
      car.markerPosition = transform;
      car.marker.setAttribute('transform', transform);
    }
  }
  const labels = positions.map(car => `P${car.number} · ${roster[car.character].short}${car.bot ? ' (CPU)' : ''}${car.finishedAt !== null ? ' · ' + car.finishedAt.toFixed(2) + ' s' : ''}`);
  if (labels.join('|') !== ranking.dataset.lines) {
    ranking.dataset.lines = labels.join('|');
    ranking.replaceChildren(...labels.map((label, i) => {
      const row = document.createElement('li');
      row.append(seatBadge(positions[i]), document.createTextNode(label.split(' · ').slice(1).join(' · ')));
      return row;
    }));
  }
  ranking.classList.add('places');
  const activeBoxes = trackItems.boxes.filter(box => box.availableAt <= Math.max(0, elapsed - raceStart));
  const markers = activeBoxes.map(box => box.id).join(',');
  if (markers !== pickupMarkers) {
    pickupMarkers = markers;
    mapPickups.replaceChildren(...activeBoxes.map(box => {
      const [x, y] = track.mapPoint(box.x, box.z);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', '1.25');
      marker.setAttribute('fill', '#a7e8ff');
      return marker;
    }));
  }
}

function raceAudio() {
  const countdown = elapsed < countdownStart ? '' : elapsed < raceStart
    ? String(Math.ceil(raceStart - elapsed)) : elapsed < raceStart + 0.85 ? 'GO!' : '';
  if (countdownLabel.textContent !== countdown) {
    countdownLabel.textContent = countdown;
    if (countdown) audio.cue(countdown === 'GO!' ? 'go' : 'count');
  }
  const cues = new Set();
  const humans = cars.filter(car => !car.bot);
  for (const car of humans) {
    const previous = car.audioState;
    if (car.roulette && !previous.roulette) cues.add('box');
    if (car.item && previous.roulette && !car.roulette) cues.add('ready');
    if (car.itemUses < previous.uses) cues.add('use');
    if (car.boostTime > 0 && !previous.boost) cues.add('boost');
    if (car.spinTime > 0 && !previous.spin) cues.add('hit');
    if (car.wallContact && !previous.wall && elapsed - (previous.lastWall ?? -Infinity) > 0.3) {
      cues.add('wall');
      previous.lastWall = elapsed;
    }
    if (car.finishedAt !== null && !previous.finished) cues.add('finish');
    Object.assign(previous, { roulette: car.roulette, uses: car.itemUses, boost: car.boostTime > 0,
      spin: car.spinTime > 0, wall: car.wallContact, finished: car.finishedAt !== null });
  }
  for (const cue of cues) audio.cue(cue);
  const active = humans.find(car => car.finishedAt === null);
  audio.update(elapsed >= raceStart && Boolean(active), elapsed >= flyoverSeconds ? active : undefined,
    active?.lap >= 2, false, track.id);
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
      if (elapsed > raceStart) {
        const raceTime = elapsed - raceStart;
        const leaderProgress = Math.max(...cars.map(car => car.progress));
        const starts = cars.map(({ x, z }) => [x, z]);
        for (const car of cars) {
          physics(car, step, catchUpFactor(track, car, leaderProgress, cars.length));
        }
        resolveKartCollisions(track, cars);
        for (const [index, car] of cars.entries()) advanceProgress(track, car, ...starts[index], raceTime, step);
        const positions = standings(cars);
        for (const car of positions) {
          if (car.bot) {
            if (useBotItem(car, positions, raceTime)) trackItems.use(car, raceTime, positions, car.item === 'banana');
            continue;
          }
          const shot = car.controls.shellShot ?? 0;
          if (car.fireQueued || shot > car.lastShellShot) {
            const keyboardBrake = (car.keyboard || car.number === 1) && keys.has('shift');
            trackItems.use(car, raceTime, positions, car.controls.brake || keyboardBrake);
            car.fireQueued = false;
            car.lastShellShot = shot;
          }
        }
        trackItems.update(raceTime, positions, step);
      }
    }
    for (const car of cars) car.mesh = null;
    const flying = elapsed < flyoverSeconds;
    intro.hidden = !flying;
    views.hidden = flying;
    if (flying) {
      const half = flyoverSeconds / 2;
      const shot = scene.filmShots[elapsed < half ? 1 : 0];
      const phase = reduceMotion.matches ? 0.5 : smooth((elapsed % half) / half);
      draw(null, courseShot(shot, phase), introView);
    } else {
      const movingIn = elapsed < countdownStart && !reduceMotion.matches;
      for (const car of cars) if (car.canvas) draw(car, movingIn ? gridCamera(car) : undefined);
    }
    hud();
    raceAudio();
  } else {
    panCourse(now);
    audio.update(false, undefined, false, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
