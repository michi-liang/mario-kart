const beat = 60 / 146;
const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 69], [55, 59, 62, 65]];
const melody = [0, 2, 1, 3, 2, 1, 2, 3];
const lobbyChords = [[54, 57, 61, 64], [50, 54, 57, 61], [57, 61, 64, 68], [52, 56, 59, 66]];
const lobbyArpeggio = [0, 2, 3, 2, 1, 3, 2, 1];
const resultsChords = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
const frequency = note => 440 * 2 ** ((note - 69) / 12);

export function createRaceAudio() {
  let context;
  let music;
  let effects;
  let levels = { music: 70, effects: 85 };
  let engine;
  let engineHarmonic;
  let engineFilter;
  let engineGain;
  let roadFilter;
  let roadGain;
  let nextBeat = 0;
  let step = 0;
  let lastMode = '';
  let summitMusic;
  let summitBuffer;
  let summitSource;
  let summitUnavailable = false;
  let boostNoise;
  let sparkNoise;

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
    try {
      if (!context) {
        context = new AudioContext();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.ratio.value = 8;
        limiter.connect(context.destination);
        music = context.createGain();
        effects = context.createGain();
        music.connect(limiter);
        effects.connect(limiter);
        music.gain.value = levels.music * 0.0053;
        effects.gain.value = levels.effects * 0.0094;
        engine = context.createOscillator();
        engine.type = 'triangle';
        engineHarmonic = context.createOscillator();
        engineHarmonic.type = 'sawtooth';
        const harmonic = context.createGain();
        harmonic.gain.value = 0.34;
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        engineFilter = context.createBiquadFilter();
        engineFilter.frequency.value = 280;
        engine.connect(engineFilter).connect(engineGain).connect(effects);
        engineHarmonic.connect(harmonic).connect(engineFilter);
        engine.start();
        engineHarmonic.start();
        const road = context.createBufferSource();
        road.buffer = noiseBuffer(2);
        road.loop = true;
        roadFilter = context.createBiquadFilter();
        roadFilter.type = 'bandpass';
        roadFilter.Q.value = 0.8;
        roadGain = context.createGain();
        roadGain.gain.value = 0;
        road.connect(roadFilter).connect(roadGain).connect(effects);
        road.start();
      }
      await context.resume();
    } catch {
      // The race is playable on browsers that block or lack Web Audio.
    }
  }

  function tone(at, from, duration, level, type = 'triangle', to = from, bus = effects) {
    const voice = context.createOscillator();
    const gain = context.createGain();
    voice.type = type;
    voice.frequency.setValueAtTime(from, at);
    voice.frequency.exponentialRampToValueAtTime(to, at + duration);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    voice.connect(gain).connect(bus);
    voice.start(at);
    voice.stop(at + duration + 0.01);
  }

  function musicTone(at, from, duration, level, type = 'triangle', to = from) {
    tone(at, from, duration, level, type, to, music);
  }

  function noiseBuffer(duration) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function fireBurst(at) {
    const duration = 0.38;
    boostNoise ??= noiseBuffer(duration);
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
    noise.connect(filter).connect(gain).connect(effects);
    noise.start(at);
  }

  function spark(at, shock) {
    const duration = shock ? 0.36 : 0.095;
    sparkNoise ??= noiseBuffer(0.38);
    const source = context.createBufferSource();
    source.buffer = sparkNoise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(shock ? 3400 : 2600, at);
    filter.frequency.exponentialRampToValueAtTime(shock ? 280 : 980, at + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(shock ? 0.38 : 0.19, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(filter).connect(gain).connect(effects);
    source.start(at, Math.random() * 0.015, duration);
  }

  function cheer(at, yahoo) {
    const voice = context.createOscillator();
    const gain = context.createGain();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(yahoo ? 260 : 285, at);
    voice.frequency.exponentialRampToValueAtTime(yahoo ? 480 : 410, at + 0.17);
    voice.frequency.exponentialRampToValueAtTime(268, at + 0.43);
    for (const [first, second] of yahoo ? [[830, 315], [1420, 790]] : [[470, 620], [1100, 1880]]) {
      const formant = context.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 4;
      formant.frequency.setValueAtTime(first, at);
      formant.frequency.setValueAtTime(second, at + 0.17);
      voice.connect(formant).connect(gain);
    }
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(0.48, at + 0.045);
    gain.gain.linearRampToValueAtTime(0.095, at + 0.142);
    gain.gain.linearRampToValueAtTime(0.43, at + 0.205);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.46);
    gain.connect(effects);
    voice.start(at);
    voice.stop(at + 0.47);
  }

  function cue(name) {
    if (context?.state !== 'running' || !(['fanfare', 'cup'].includes(name) ? levels.music : levels.effects)) return;
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
      case 'box':
        tone(at, 290, 0.10, 0.29, 'triangle', 170);
        tone(at + 0.03, 620, 0.19, 0.28, 'sine', 1240);
        break;
      case 'roll': tone(at, 1060, 0.06, 0.19, 'triangle', 710); break;
      case 'coin':
        tone(at, 1090, 0.10, 0.22, 'triangle', 1430);
        tone(at + 0.055, 1860, 0.14, 0.18, 'sine');
        break;
      case 'coin-toss':
        tone(at, 620, 0.15, 0.15, 'triangle', 1150);
        tone(at + 0.13, 940, 0.19, 0.12, 'sine', 1750);
        tone(at + 0.28, 1450, 0.15, 0.09, 'triangle', 1980);
        break;
      case 'incoming':
        tone(at, 435, 0.14, 0.23, 'triangle', 630);
        tone(at + 0.13, 700, 0.12, 0.19, 'triangle', 895);
        break;
      case 'spark': spark(at, false); break;
      case 'shock':
        spark(at, true);
        tone(at, 640, 0.31, 0.27, 'sawtooth', 54);
        break;
      case 'yahoo': cheer(at, true); break;
      case 'hurray': cheer(at, false); break;
      case 'lap':
        tone(at, 680, 0.16, 0.21);
        tone(at + 0.09, 1014, 0.23, 0.23);
        break;
      case 'cup':
        for (const [i, note] of [48, 67, 71, 76, 79].entries()) {
          musicTone(at + i * 0.13, frequency(note), 0.48, i ? 0.16 : 0.25);
        }
        break;
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
          for (const [i, note] of notes.entries()) musicTone(at + offset, frequency(note), length, i ? 0.085 : 0.23);
          musicTone(at + offset, 156, 0.12, 0.14, 'sine', 54);
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
    if (context?.state !== 'running') return;
    const now = context.currentTime;
    const speed = Math.max(Math.abs(car?.speed ?? 0), playing ? 0 : Math.min(14, (car?.launchHold ?? 0) * 9));
    const throttle = playing ? car?.driveThrottle ?? 0 : Math.min(1, (car?.launchHold ?? 0) * 2);
    const air = Boolean(car?.flight || car?.jumpTime > 0);
    const skid = Boolean(car?.driftDirection || car?.wallContact);
    const gravel = Boolean(car?.driveOffRoad);
    const rev = 36 + speed * 1.85 + throttle * 11;
    engine.frequency.setTargetAtTime(rev, now, 0.085);
    engineHarmonic.frequency.setTargetAtTime(rev * 2.01, now, 0.085);
    engineFilter.frequency.setTargetAtTime(125 + speed * 4 + throttle * 55, now, 0.11);
    engineGain.gain.setTargetAtTime(car ? 0.014 + Math.min(speed / 27, 1) * 0.011 + throttle * 0.015 : 0, now, 0.12);
    roadFilter.frequency.setTargetAtTime(air ? 750 : skid ? 1250 : gravel ? 260 : 400 + speed * 13, now, 0.09);
    roadGain.gain.setTargetAtTime(car ? Math.min(speed / 25, 1.35) *
      (air ? 0.11 : skid ? 0.20 : gravel ? 0.25 : 0.075) : 0, now, 0.12);
    const mode = trackId === 'results' ? 'results' : playSummit ? 'summit' : playing ? 'race' : lobby ? 'lobby' : '';
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
        summitSource.connect(mix).connect(music);
        summitSource.onended = () => mix.disconnect();
        summitSource.start();
      }
      return;
    }
    if (!mode) return;
    if (nextBeat < now - 0.12) nextBeat = now + 0.014;
    if (!nextBeat) nextBeat = now + 0.014;
    const interval = mode === 'results' ? 60 / 112 / 2 : lobby ? 60 / 118 / 4 : beat / (fast ? 2.26 : 2);
    while (nextBeat < now + 0.1) {
      if (mode === 'results') {
        const chord = resultsChords[Math.floor(step / 8) % 4];
        if (step % 4 === 0) {
          musicTone(nextBeat, frequency(chord[0] - 12), 0.46, 0.18);
          for (const note of chord) musicTone(nextBeat + 0.03, frequency(note), 0.57, 0.05, 'sine');
        }
        musicTone(nextBeat, frequency(chord[lobbyArpeggio[step % 8]] + 12), 0.22, 0.13);
        step++;
        nextBeat += interval;
        continue;
      }
      if (lobby) {
        const chord = lobbyChords[Math.floor(step / 16) % lobbyChords.length];
        const pulse = step % 16;
        if (pulse % 4 === 0) {
          musicTone(nextBeat, 118, 0.18, 0.24, 'sine', 43);
          musicTone(nextBeat + 0.075, frequency(chord[0] - 12), 0.36, 0.15, 'triangle');
        }
        if (pulse % 8 === 4) musicTone(nextBeat, 220, 0.095, 0.075, 'square', 84);
        if (pulse % 4 === 2) musicTone(nextBeat, 4200, 0.044, 0.045, 'square', 730);
        if (pulse === 0 || pulse === 10) {
          for (const note of chord) musicTone(nextBeat + 0.026, frequency(note), 0.46, 0.044);
        }
        const high = frequency(chord[lobbyArpeggio[pulse % 8]] + (pulse > 11 ? 24 : 12));
        musicTone(nextBeat, high, 0.14, pulse % 2 ? 0.042 : 0.086);
        musicTone(nextBeat + 0.187, high, 0.13, 0.026, 'sine');
        step++;
        nextBeat += interval;
        continue;
      }
      const subdivision = step % 8;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (subdivision % 2 === 0) {
        musicTone(nextBeat, 125, 0.13, 0.18, 'sine', 43);
        musicTone(nextBeat, frequency(chord[0] - (subdivision === 6 ? 5 : 12)), 0.19, 0.13);
      } else {
        musicTone(nextBeat, 1300, 0.04, 0.033, 'square', 620);
      }
      const note = chord[melody[subdivision]] + (subdivision === 7 ? 24 : 12);
      musicTone(nextBeat, frequency(note), 0.15, subdivision === 0 ? 0.13 : 0.085, 'triangle');
      if (subdivision === 2 || subdivision === 6) {
        for (const chordNote of chord.slice(0, 3)) musicTone(nextBeat, frequency(chordNote), 0.22, 0.048);
      }
      step++;
      nextBeat += interval;
    }
  }

  function setLevels(next) {
    levels = { ...next };
    if (!music || !effects) return;
    music.gain.setTargetAtTime(levels.music * 0.0053, context.currentTime, 0.035);
    effects.gain.setTargetAtTime(levels.effects * 0.0094, context.currentTime, 0.035);
  }

  return { unlock, setLevels, update, cue, preloadSummit };
}
