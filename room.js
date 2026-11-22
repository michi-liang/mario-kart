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
  const connected = (seat, now) => now - seat.lastSeen < 1000;
  function contestants(now) {
    const active = [...seats.values()].filter(seat => connected(seat, now));
    return mode === 'test' ? active.slice(0, 1) : active;
  }

  function host({ action, character, track: chosenTrack }, now = Date.now()) {
    if (action === 'menu' || action === 'test' || action === 'play') {
      phase = action === 'menu' ? 'menu' : 'selection';
      if (action !== 'menu') mode = action;
      for (const seat of seats.values()) {
        seat.ready = false;
      }
      return true;
    }
    if (phase !== 'selection') return false;
    if (action === 'track') {
      if (!trackIds.includes(chosenTrack)) return false;
      track = chosenTrack;
      return true;
    }
    const active = contestants(now);
    if (action === 'pick' && active.length === 0 && Number.isInteger(character) && character >= 0 && character < 16) {
      soloPick = character;
      return true;
    }
    if (action !== 'start' || active.some(seat => !seat.ready)) return false;
    racingSeats = active.length ? active : [{ number: 1, character: soloPick, keyboard: true }];
    if (mode === 'play') {
      const used = new Set(racingSeats.map(seat => seat.character));
      for (let number = 1; number <= 12; number++) {
        if (racingSeats.some(seat => seat.number === number)) continue;
        const character = Array.from({ length: 16 }, (_, i) => (i * 5 + number * 3) % 16)
          .find(index => !used.has(index));
        used.add(character);
        racingSeats.push({ number, character, bot: true });
      }
    }
    for (const seat of racingSeats) seat.shellShot = 0;
    phase = 'racing';
    round++;
    return true;
  }

  function input(id, data, now = Date.now()) {
    const { steer, throttle, brake = false, pitch = 0, command, sequence } = data || {};
    if (!/^[a-f0-9]{24}$/.test(id ?? '') || ![steer, throttle, pitch].every(Number.isFinite) ||
      typeof brake !== 'boolean' || (command !== undefined &&
        (typeof command !== 'string' || (!Object.hasOwn(moves, command) && command !== 'confirm' && command !== 'fire') ||
          !Number.isSafeInteger(sequence) || sequence < 1))) {
      return { status: 400, error: 'Invalid controller input' };
    }
    let seat = seats.get(id);
    if (!seat) {
      if (seats.size >= 4) return { status: 409, error: 'All four player slots are taken.' };
      if (phase === 'racing') return { status: 409, error: 'Wait for the next lobby to join.' };
      seat = { number: seats.size + 1, character: seats.size, sequence: 0, ready: false };
      seats.set(id, seat);
    }
    if (!connected(seat, now) && phase === 'selection') {
      seat.ready = false;
    }
    seat.lastSeen = now;
    seat.controls = { steer: clamp(steer), throttle: clamp(throttle), brake, pitch: clamp(pitch) };
    const selecting = phase === 'selection' && contestants(now).includes(seat);
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
      } else if (command === 'fire' && phase === 'racing' && racingSeats.includes(seat)) {
        seat.shellShot = sequence;
      }
    }
    const inRace = phase === 'racing' && racingSeats.includes(seat);
    const taken = selecting && !seat.ready && contestants(now).some(other =>
      other !== seat && other.ready && other.character === seat.character);
    return { status: 200, number: seat.number,
      phase: (phase === 'racing' && !inRace) || (phase === 'selection' && !selecting) ? 'menu' : phase,
      mode, ready: seat.ready, character: seat.character, taken };
  }

  function snapshot(now = Date.now()) {
    const source = phase === 'racing' ? racingSeats :
      phase === 'selection' && mode === 'test' ? contestants(now) : [...seats.values()];
    const players = source.map(seat => {
      const live = connected(seat, now);
      const controlsFresh = now - seat.lastSeen < 600;
      return { number: seat.number, character: seat.character, ready: !!seat.ready, connected: live,
        keyboard: !!seat.keyboard, bot: !!seat.bot, shellShot: seat.shellShot ?? 0,
        ...(phase === 'racing' && controlsFresh ? seat.controls : idle) };
    });
    return { phase, mode, round, players, soloPick, track };
  }
  return { input, host, snapshot };
}
