import { trackList } from './public/track.js';

const idle = { steer: 0, throttle: 0, brake: false, pitch: 0 };
const clamp = value => Math.max(-1, Math.min(1, value));
const moves = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
export const trackIds = trackList.map(track => track.id);

export function createRoom() {
  const seats = new Map();
  let phase = 'menu';
  let mode = 'test';
  let round = 0;
  let soloPick = 0;
  let track = trackIds[0];
  let racingSeats = [];
  let finishTimes = [];
  let recoverable = 0;
  const connected = (seat, now) => now - seat.lastSeen < 1000;
  function contestants(now) {
    const active = [...seats.values()].filter(seat => connected(seat, now));
    return mode === 'play' ? active : active.slice(0, 1);
  }

  function host({ action, character, track: chosenTrack, raceRound, mask, times }, now = Date.now()) {
    if (action === 'recovery-status') {
      if (phase !== 'racing' || raceRound !== round || !Number.isInteger(mask) || mask < 0 || mask > 15) return false;
      recoverable = mask;
      return true;
    }
    if (action === 'results') {
      if (phase !== 'racing' || raceRound !== round || !Array.isArray(times) || times.length !== racingSeats.length ||
          times.some(time => !Number.isSafeInteger(time) || time < 0)) return false;
      finishTimes = times;
      recoverable = 0;
      phase = 'results';
      return true;
    }
    if (action === 'next-track') {
      if (phase !== 'results' || raceRound !== round) return false;
      phase = 'track-selection';
      return true;
    }
    if (['menu', 'single', 'play', 'test'].includes(action)) {
      phase = action === 'menu' ? 'menu' : 'pairing';
      if (action !== 'menu') mode = action;
      for (const seat of seats.values()) {
        seat.ready = false;
      }
      return true;
    }
    if (phase === 'pairing' && action === 'choose-track') {
      if (mode === 'play' && contestants(now).length === 0) return false;
      phase = 'track-selection';
      return true;
    }
    if (phase === 'track-selection') {
      if (action === 'continue') {
        phase = 'selection';
        return true;
      }
      if (action !== 'track' || !trackIds.includes(chosenTrack)) return false;
      track = chosenTrack;
      return true;
    }
    if (phase !== 'selection') return false;
    if (action === 'back-to-tracks') {
      phase = 'track-selection';
      return true;
    }
    const active = contestants(now);
    if (action === 'pick' && active.length === 0 && Number.isInteger(character) && character >= 0 && character < 16) {
      soloPick = character;
      return true;
    }
    if (action !== 'start' || (mode === 'play' && active.length === 0) || active.some(seat => !seat.ready)) return false;
    racingSeats = active.length ? active : [{ number: 1, character: soloPick, keyboard: true }];
    startRace();
    return true;
  }

  function startRace() {
    if (mode !== 'test') {
      const used = new Set(racingSeats.map(seat => seat.character));
      for (let number = 1; number <= 12; number++) {
        if (racingSeats.some(seat => seat.number === number)) continue;
        const character = Array.from({ length: 16 }, (_, i) => (i * 5 + number * 3) % 16)
          .find(index => !used.has(index));
        used.add(character);
        racingSeats.push({ number, character, bot: true });
      }
    }
    for (const seat of racingSeats) {
      seat.shellShot = 0;
      seat.resetRequest = 0;
      seat.brakeTap = 0;
    }
    recoverable = 0;
    finishTimes = [];
    phase = 'racing';
    round++;
  }

  function input(id, data, now = Date.now()) {
    const { steer, throttle, brake = false, pitch = 0, command, sequence } = data || {};
    if (!/^[a-f0-9]{24}$/.test(id ?? '') || ![steer, throttle, pitch].every(Number.isFinite) ||
      typeof brake !== 'boolean' || (command !== undefined &&
        (typeof command !== 'string' || (!Object.hasOwn(moves, command) &&
          !['confirm', 'fire', 'reset', 'brake-tap'].includes(command)) ||
          !Number.isSafeInteger(sequence) || sequence < 1))) {
      return { status: 400, error: 'Invalid controller input' };
    }
    let seat = seats.get(id);
    if (!seat) {
      if (seats.size >= 4) return { status: 409, error: 'All four player slots are taken.' };
      if (phase === 'racing' || phase === 'results' || phase === 'menu') {
        return { status: 409, error: 'Wait for the host to open the lobby.' };
      }
      if (mode !== 'play' && contestants(now).length) return { status: 409, error: 'This mode has one controller slot.' };
      seat = { number: seats.size + 1, character: seats.size, sequence: 0, ready: false };
      seats.set(id, seat);
    }
    if (!connected(seat, now) && (phase === 'selection' || phase === 'track-selection')) {
      seat.ready = false;
    }
    seat.lastSeen = now;
    seat.controls = { steer: clamp(steer), throttle: clamp(throttle), brake, pitch: clamp(pitch) };
    const selecting = phase === 'selection' && contestants(now).includes(seat);
    const participating = racingSeats.includes(seat);
    const canReset = phase === 'racing' && participating && !!(recoverable & (1 << (seat.number - 1)));
    if (command && sequence > seat.sequence) {
      seat.sequence = sequence;
      if (selecting && command === 'confirm') {
        seat.ready = !seat.ready && !contestants(now).some(other =>
          other !== seat && other.ready && other.character === seat.character);
      } else if (selecting && !seat.ready && Object.hasOwn(moves, command)) {
        const [dx, dy] = moves[command];
        const col = (seat.character % 4 + dx + 4) % 4;
        const row = (Math.floor(seat.character / 4) + dy + 4) % 4;
        seat.character = row * 4 + col;
      } else if (command === 'fire' && phase === 'racing' && participating) {
        seat.shellShot = sequence;
      } else if (command === 'reset' && canReset) {
        seat.resetRequest = sequence;
      } else if (command === 'brake-tap' && phase === 'racing' && participating) {
        seat.brakeTap = sequence;
      }
    }
    const taken = selecting && !seat.ready && contestants(now).some(other =>
      other !== seat && other.ready && other.character === seat.character);
    return { status: 200, number: seat.number,
      phase: (phase === 'racing' && !participating) ||
        (phase === 'selection' && !selecting) ? 'menu' : phase,
      mode, ready: seat.ready, canReset, character: seat.character, taken };
  }

  function snapshot(now = Date.now()) {
    const source = phase === 'racing' || phase === 'results' ? racingSeats : contestants(now);
    const players = source.map((seat, index) => {
      const live = connected(seat, now);
      const controlsFresh = now - seat.lastSeen < 600;
      return { number: seat.number, character: seat.character, ready: !!seat.ready, connected: live,
        keyboard: !!seat.keyboard, bot: !!seat.bot, shellShot: seat.shellShot ?? 0,
        resetRequest: seat.resetRequest ?? 0,
        brakeTap: seat.brakeTap ?? 0,
        ...(phase === 'results' ? { finishTime: finishTimes[index] } : {}),
        ...(phase === 'racing' && controlsFresh ? seat.controls : idle) };
    });
    return { phase, mode, round, players, soloPick, track };
  }
  return { input, host, snapshot };
}
