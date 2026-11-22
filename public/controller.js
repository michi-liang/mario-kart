import { playerColors, roster } from './roster.js';

const endpoint = '/input' + location.search;
const tilt = document.querySelector('#tilt');
const needle = document.querySelector('#needle');
const help = document.querySelector('#tilt-help');
const status = document.querySelector('#room-status');
const lobby = document.querySelector('#phone-lobby');
const race = document.querySelector('#phone-race');
const arrows = document.querySelector('#arrows');
const arrowButtons = [...arrows.querySelectorAll('button')];
const confirmPick = document.querySelector('#confirm-pick');
const number = document.querySelector('#player-number');
const pick = document.querySelector('#phone-pick');
const lobbyTilt = document.querySelector('#lobby-tilt');
const raceTilt = document.querySelector('#race-tilt');
const brake = document.querySelector('#brake');
const gas = document.querySelector('#gas');
const landscape = window.matchMedia('(orientation: landscape)');
const pressed = new Map([brake, gas].map(button => [button, new Set()]));
const tiltDeadZone = 1.3;
const fullSteerAngle = 41;
const id = sessionStorage.getItem('pocket-circuit-seat') ||
  Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('');
sessionStorage.setItem('pocket-circuit-seat', id);
let sequence = Number(sessionStorage.getItem('pocket-circuit-command')) || 0;
const commands = [];
let lastState = '';
let tiltEnabled = false;
let baseline = null;
let pitchBaseline = 0;
let motionSeen = -Infinity;
let steering = 0;
let glidePitch = 0;
let sending = false;
let sensorTimer;
let lastError;

function tiltResponse(angle) {
  const value = Math.max(0, Math.min(1, (Math.abs(angle) - tiltDeadZone) / (fullSteerAngle - tiltDeadZone)));
  return value === 0 ? 0 : Math.sign(angle) * (1.12 * value - 0.12 * value ** 2);
}
function calibrate() {
  baseline = null;
  motionSeen = -Infinity;
  steering = 0;
  glidePitch = 0;
  help.textContent = 'Hold the phone like a steering wheel.';
  clearTimeout(sensorTimer);
  sensorTimer = setTimeout(() => { help.textContent = 'Raise the phone to a more upright angle.'; }, 3500);
}
function orient(event) {
  if (!tiltEnabled || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  const beta = event.beta * Math.PI / 180;
  const gamma = event.gamma * Math.PI / 180;
  // A fixed screen rotation adds a constant to the projected angle. Calibration
  // removes it, so the steering sign stays the same with portrait lock enabled.
  const horizontal = Math.sin(gamma) * Math.cos(beta);
  const vertical = Math.sin(beta);
  const pitch = Math.asin(Math.cos(beta) * Math.cos(gamma)) * 180 / Math.PI;
  if (Math.hypot(horizontal, vertical) < 0.23) {
    steering = 0;
    glidePitch = 0;
    help.textContent = 'Raise the phone to a more upright angle.';
    return;
  }
  const roll = Math.atan2(horizontal, vertical) * 180 / Math.PI;
  const now = performance.now();
  if (baseline === null) {
    baseline = roll;
    pitchBaseline = pitch;
    tilt.textContent = 'Recenter';
    clearTimeout(sensorTimer);
  }
  if (help.textContent) help.textContent = '';
  const angle = ((roll - baseline + 540) % 360) - 180;
  const blend = 1 - Math.exp(-(now - motionSeen) / 30);
  steering += (tiltResponse(angle) - steering) * blend;
  const pitchDelta = pitch - pitchBaseline;
  const targetPitch = Math.sign(pitchDelta) * Math.min(1, Math.max(0, (Math.abs(pitchDelta) - 2) / 23));
  glidePitch += (targetPitch - glidePitch) * blend;
  motionSeen = now;
}

tilt.addEventListener('click', async () => {
  if (tiltEnabled) return calibrate();
  tilt.disabled = true;
  try {
    const request = window.DeviceOrientationEvent?.requestPermission;
    if (request && await request.call(window.DeviceOrientationEvent) !== 'granted') {
      help.textContent = 'Allow motion access to steer.';
      return;
    }
    tiltEnabled = true;
    calibrate();
  } catch {
    help.textContent = 'Motion access failed. Tap to try again.';
  } finally {
    tilt.disabled = false;
  }
});
if (!window.isSecureContext || !window.DeviceOrientationEvent) {
  tilt.disabled = true;
  help.textContent = window.isSecureContext ? 'Motion steering is unavailable.' : 'Tilt requires HTTPS.';
} else {
  window.addEventListener('deviceorientation', orient);
}

function queueCommand(command) {
  commands.push({ command, sequence: ++sequence });
  sessionStorage.setItem('pocket-circuit-command', sequence);
  tick();
}
for (const button of arrowButtons) button.addEventListener('click', () => queueCommand(button.dataset.arrow));
confirmPick.addEventListener('click', () => queueCommand('confirm'));
const use = document.querySelector('#fire-shell');
use.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  // A second finger can send pointer events without generating a click.
  event.preventDefault();
  queueCommand('fire');
});
use.addEventListener('click', event => {
  if (event.detail === 0 && !event.pointerType) queueCommand('fire');
});

for (const [button, sources] of pressed) {
  function setHeld(source, down) {
    if (down) sources.add(source);
    else sources.delete(source);
    button.classList.toggle('held', sources.size > 0);
  }
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setHeld(event.pointerId, true);
    tick();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      setHeld(event.pointerId, false);
      tick();
    });
  }
}
function clearHeld() {
  for (const [button, sources] of pressed) {
    for (const source of sources) {
      if (button.hasPointerCapture(source)) button.releasePointerCapture(source);
    }
    sources.clear();
    button.classList.remove('held');
  }
}
window.addEventListener('blur', clearHeld);
window.addEventListener('pagehide', clearHeld);
document.addEventListener('visibilitychange', clearHeld);
function updateOrientation() {
  clearHeld();
  if (tiltEnabled) calibrate();
}
landscape.addEventListener('change', updateOrientation);
window.screen.orientation?.addEventListener('change', updateOrientation);

function showConnection(error = '') {
  if (lastError === error) return;
  lastError = error;
  status.hidden = !error;
  status.textContent = error;
}
function showRoom(state) {
  const key = JSON.stringify(state);
  if (key === lastState) return;
  lastState = key;
  const selecting = state.phase === 'selection';
  const racing = state.phase === 'racing';
  if (lobby.hidden !== racing) clearHeld();
  lobby.hidden = racing;
  race.hidden = !racing;
  arrows.hidden = !selecting;
  if (!selecting && !racing) commands.length = 0;
  for (const button of arrowButtons) button.disabled = state.ready;
  confirmPick.hidden = !selecting;
  const tiltSlot = racing ? raceTilt : lobbyTilt;
  if (tilt.parentElement !== tiltSlot) tiltSlot.append(tilt, help);
  tiltSlot.hidden = !(selecting || racing);
  number.textContent = 'Player ' + state.number;
  number.style.color = playerColors[state.number - 1];
  pick.textContent = selecting ? roster[state.character].name + (state.ready ? ' · Ready' : '') : 'Waiting for the host.';
  confirmPick.textContent = state.ready ? 'Change pick' : state.taken ? 'Driver taken' : 'Confirm';
  confirmPick.disabled = state.taken;
  document.documentElement.style.setProperty('--player-color', playerColors[state.number - 1]);
}

async function tick() {
  if (document.hidden) return;
  const fresh = performance.now() - motionSeen < 500;
  const steer = fresh ? steering : 0;
  needle.style.left = (50 + steer * 46) + '%';
  if (sending) return;
  sending = true;
  const command = commands[0];
  const throttle = pressed.get(gas).size ? 1 : 0;
  let sent = false;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...command, steer, throttle, pitch: fresh ? glidePitch : 0,
        brake: pressed.get(brake).size > 0 }),
      signal: AbortSignal.timeout(800),
    });
    const result = await response.json();
    if (response.ok) {
      if (command && commands[0] === command) commands.shift();
      showConnection();
      showRoom(result);
      sent = true;
    } else {
      showConnection(result.error || 'Controller unavailable.');
    }
  } catch {
    showConnection('Reconnecting to laptop.');
  } finally {
    sending = false;
    if (sent && commands.length) tick();
  }
}

tick();
setInterval(tick, 40);
