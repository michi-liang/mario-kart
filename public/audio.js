const beat = 60 / 146;
const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 69], [55, 59, 62, 65]];
const melody = [0, 2, 1, 3, 2, 1, 2, 3];
const lobbyChords = [[54, 57, 61, 64], [50, 54, 57, 61], [57, 61, 64, 68], [52, 56, 59, 66]];
const lobbyArpeggio = [0, 2, 3, 2, 1, 3, 2, 1];
const frequency = note => 440 * 2 ** ((note - 69) / 12);

export function createRaceAudio() {
  let context;
  let master;
  let engine;
  let engineGain;
  let muted = false;
  let nextBeat = 0;
  let step = 0;
  let lastMode = '';
  let summitMusic;
  let summitBuffer;
  let summitSource;
  let summitUnavailable = false;
  let boostNoise;

  function preloadSummit() {
    if (!context || summitMusic) return;
    summitMusic = fetch('/summit-music.m4a').then(response => {
      if (!response.ok) throw new Error('Summit music unavailable');
      return response.arrayBuffer();
    }).then(bytes => context.decodeAudioData(bytes)).then(buffer => {
      summitBuffer = buffer;
    }).catch(() => {
      summitUnavailable = true;
    });
  }

  async function unlock() {
    if (muted) return;
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0.42;
        master.connect(context.destination);
        engine = context.createOscillator();
        engine.type = 'triangle';
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.frequency.value = 280;
        engine.connect(filter).connect(engineGain).connect(master);
        engine.start();
      }
      await context.resume();
    } catch {
      // The race is playable on browsers that block or lack Web Audio.
    }
  }

  function tone(at, from, duration, level, type = 'triangle', to = from) {
    const voice = context.createOscillator();
    const gain = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(from, at);
    voice.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    voice.connect(gain).connect(master);
    voice.start(at);
    voice.stop(at + duration + 0.01);
  }

  function fireBurst(at) {
    const duration = 0.38;
    if (!boostNoise) {
      boostNoise = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = boostNoise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = boostNoise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(470, at);
    filter.frequency.exponentialRampToValueAtTime(1700, at + 0.065);
    filter.frequency.exponentialRampToValueAtTime(240, at + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(0.52, at + 0.032);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    noise.connect(filter).connect(gain).connect(master);
    noise.start(at);
  }

  function cue(name) {
    if (muted || context?.state !== 'running') return;
    const at = context.currentTime;
    switch (name) {
      case 'count':
        tone(at, 520, 0.17, 0.35, 'square');
        tone(at + 0.014, 780, 0.105, 0.12, 'triangle');
        break;
      case 'go':
        tone(at, 880, 0.38, 0.33, 'square', 1046);
        tone(at + 0.055, 1320, 0.27, 0.18, 'triangle', 1568);
        break;
      case 'chomp': tone(at, 210, 0.15, 0.20, 'square', 80); break;
      case 'ink': tone(at, 160, 0.23, 0.22, 'sine', 60); break;
      case 'box': tone(at, 520, 0.18, 0.22, 'sine', 1046); break;
      case 'roll': tone(at, 950, 0.045, 0.085, 'triangle', 640); break;
      case 'ready':
        [660, 880, 1100].forEach((note, i) => tone(at + i * 0.05, note, 0.14, 0.17));
        break;
      case 'use': tone(at, 340, 0.19, 0.18, 'triangle', 1150); break;
      case 'trick': tone(at, 380, 0.25, 0.16, 'sine', 1420); break;
      case 'boost':
        fireBurst(at);
        tone(at, 95, 0.21, 0.13, 'triangle', 185);
        break;
      case 'hit': tone(at, 150, 0.29, 0.32, 'sawtooth', 42); break;
      case 'wall': tone(at, 90, 0.11, 0.15, 'square', 45); break;
      case 'finish':
        [523, 659, 784, 1046].forEach((note, i) => tone(at + i * 0.085, note, 0.21, 0.21));
        break;
      case 'fanfare':
        for (const [offset, length, notes] of [
          [0, 0.16, [67, 60, 48]], [0.18, 0.16, [72, 64, 55]], [0.36, 0.20, [76, 67, 60]],
          [0.61, 0.27, [79, 72, 55]], [0.94, 0.28, [77, 74, 59]], [1.26, 0.92, [84, 76, 72, 60]],
        ]) {
          for (const [i, note] of notes.entries()) tone(at + offset, frequency(note), length, i ? 0.085 : 0.23);
          tone(at + offset, 156, 0.12, 0.14, 'sine', 54);
        }
        break;
    }
  }

  function update(playing, car, fast, lobby = false, trackId) {
    const playSummit = playing && trackId === 'summit' && !summitUnavailable;
    if (!playSummit && summitSource) {
      summitSource.stop();
      summitSource.disconnect();
      summitSource = undefined;
    }
    if (muted || context?.state !== 'running') return;
    const now = context.currentTime;
    const speed = Math.max(Math.abs(car?.speed ?? 0), playing ? 0 : Math.min(14, (car?.launchHold ?? 0) * 9));
    engine.frequency.setTargetAtTime(38 + speed * 3.3, now, 0.08);
    engineGain.gain.setTargetAtTime(car ? 0.034 + Math.min(speed / 27, 1) * 0.033 : 0, now, 0.12);
    const mode = playSummit ? 'summit' : playing ? 'race' : lobby ? 'lobby' : '';
    if (mode !== lastMode) {
      lastMode = mode;
      step = 0;
      nextBeat = now + 0.014;
    }
    if (playSummit) {
      preloadSummit();
      if (summitBuffer && !summitSource) {
        summitSource = context.createBufferSource();
        summitSource.buffer = summitBuffer;
        summitSource.loop = true;
        const mix = context.createGain();
        mix.gain.value = 0.55;
        summitSource.connect(mix).connect(master);
        summitSource.onended = () => mix.disconnect();
        summitSource.start();
      }
      return;
    }
    if (!mode) return;
    if (nextBeat < now - 0.12) nextBeat = now + 0.014;
    if (!nextBeat) nextBeat = now + 0.014;
    const interval = lobby ? 60 / 118 / 4 : beat / (fast ? 2.26 : 2);
    while (nextBeat < now + 0.1) {
      if (lobby) {
        const chord = lobbyChords[Math.floor(step / 16) % lobbyChords.length];
        const pulse = step % 16;
        if (pulse % 4 === 0) {
          tone(nextBeat, 118, 0.18, 0.24, 'sine', 43);
          tone(nextBeat + 0.075, frequency(chord[0] - 12), 0.36, 0.15, 'triangle');
        }
        if (pulse % 8 === 4) tone(nextBeat, 220, 0.095, 0.075, 'square', 84);
        if (pulse % 4 === 2) tone(nextBeat, 4200, 0.044, 0.045, 'square', 730);
        if (pulse === 0 || pulse === 10) {
          for (const note of chord) tone(nextBeat + 0.026, frequency(note), 0.46, 0.044);
        }
        const high = frequency(chord[lobbyArpeggio[pulse % 8]] + (pulse > 11 ? 24 : 12));
        tone(nextBeat, high, 0.14, pulse % 2 ? 0.042 : 0.086);
        tone(nextBeat + 0.187, high, 0.13, 0.026, 'sine');
        step++;
        nextBeat += interval;
        continue;
      }
      const subdivision = step % 8;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (subdivision % 2 === 0) {
        tone(nextBeat, 125, 0.13, 0.18, 'sine', 43);
        tone(nextBeat, frequency(chord[0] - (subdivision === 6 ? 5 : 12)), 0.19, 0.13);
      } else {
        tone(nextBeat, 1300, 0.04, 0.033, 'square', 620);
      }
      const note = chord[melody[subdivision]] + (subdivision === 7 ? 24 : 12);
      tone(nextBeat, frequency(note), 0.15, subdivision === 0 ? 0.13 : 0.085, 'triangle');
      if (subdivision === 2 || subdivision === 6) {
        for (const chordNote of chord.slice(0, 3)) tone(nextBeat, frequency(chordNote), 0.22, 0.048);
      }
      step++;
      nextBeat += interval;
    }
  }

  function toggle() {
    muted = !muted;
    if (context) master.gain.setTargetAtTime(muted ? 0 : 0.42, context.currentTime, 0.035);
    if (!muted) unlock();
    return !muted;
  }

  return { unlock, toggle, update, cue, preloadSummit };
}
