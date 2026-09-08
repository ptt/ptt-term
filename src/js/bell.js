// Terminal BEL (^G / \x07) acoustic synthesizer via Web Audio API.
//
// Follows standard terminal conventions:
// - Pitch: 750 Hz (Linux virtual terminal default in drivers/tty/vt/vt.c, setterm --bfreq 750)
// - Duration: 100 ms (DEC VT100 hardware bell duration, setterm --blength 100)
// - Rate-limiting: 100 ms cooldown to prevent audio flooding/overlap on burst inputs
//
// Envelope adheres to iOS/macOS audio design principles:
// Uses a percussive bell profile (rapid 4ms attack to eliminate clicks, followed by
// a natural acoustic exponential decay to silence) rather than a continuous test buzzer.

export const DEFAULT_BELL_PITCH_HZ = 750;
export const DEFAULT_BELL_DURATION_MS = 100;
export const BELL_COOLDOWN_MS = 100;

const BELL_DURATION_S = DEFAULT_BELL_DURATION_MS / 1000;
const BELL_ATTACK_S = 0.004;
const BELL_PEAK_GAIN = 0.06;
const SILENCE_GAIN = 0.0001; // -80dB floor for exponential ramping

let isBellEnabled = true;
let bellMode = 'always';
let audioContext = null;
let lastBellTimestamp = -Infinity;
let isWindowFocusedState = true;

let audioContextFactory = () => {
  const AudioContextClass =
    typeof window !== 'undefined' &&
    (window.AudioContext || window.webkitAudioContext);
  return AudioContextClass ? new AudioContextClass() : null;
};

export function setWindowFocused(focused) {
  isWindowFocusedState = !!focused;
}

export function isWindowFocused() {
  if (typeof document !== 'undefined') {
    if (document.hasFocus) {
      return document.hasFocus();
    }
    if (typeof document.hidden === 'boolean') {
      return !document.hidden;
    }
  }
  return isWindowFocusedState;
}

export function canPlayBell(
  now = Date.now(),
  state = {
    enabled: isBellEnabled,
    mode: bellMode,
    lastPlayedAt: lastBellTimestamp,
    isFocused: undefined,
  }
) {
  const mode =
    state.mode !== undefined
      ? state.mode
      : state.enabled === false
      ? 'off'
      : bellMode;
  if (state.enabled === false || mode === 'off') return false;

  if (mode === 'background') {
    const focused =
      state.isFocused !== undefined ? state.isFocused : isWindowFocused();
    if (focused) return false;
  }

  const cooldown =
    state.cooldownMs !== undefined ? state.cooldownMs : BELL_COOLDOWN_MS;
  return now - (state.lastPlayedAt !== undefined ? state.lastPlayedAt : lastBellTimestamp) >= cooldown;
}

export function setTerminalBellEnabled(enabledOrMode) {
  if (enabledOrMode === false || enabledOrMode === 'off') {
    bellMode = 'off';
    isBellEnabled = false;
  } else if (enabledOrMode === 'background') {
    bellMode = 'background';
    isBellEnabled = true;
  } else {
    bellMode = 'always';
    isBellEnabled = true;
  }
}

export function getTerminalBellMode() {
  return bellMode;
}

export function isTerminalBellEnabled() {
  return isBellEnabled && bellMode !== 'off';
}

export function unlockAudioContext() {
  try {
    if (!audioContext) audioContext = audioContextFactory();
    if (
      audioContext &&
      audioContext.state === 'suspended' &&
      audioContext.resume
    ) {
      audioContext.resume().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => unlockAudioContext();
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

export function playTerminalBell(now = Date.now()) {
  if (
    !canPlayBell(now, {
      enabled: isBellEnabled,
      lastPlayedAt: lastBellTimestamp,
    })
  ) {
    return false;
  }
  lastBellTimestamp = now;

  try {
    if (!audioContext) audioContext = audioContextFactory();
    if (!audioContext) return false;

    if (
      audioContext.state === 'suspended' &&
      audioContext.resume
    ) {
      audioContext.resume().catch(() => {});
    }

    const t0 = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    if (osc.frequency && osc.frequency.setValueAtTime) {
      osc.frequency.setValueAtTime(DEFAULT_BELL_PITCH_HZ, t0);
    } else if (osc.frequency) {
      osc.frequency.value = DEFAULT_BELL_PITCH_HZ;
    }

    // Percussive bell envelope:
    // 1. Initial micro-floor at t0
    // 2. Crisp 4ms linear attack to peak
    // 3. Smooth exponential decay to silence
    gain.gain.setValueAtTime(SILENCE_GAIN, t0);
    gain.gain.linearRampToValueAtTime(BELL_PEAK_GAIN, t0 + BELL_ATTACK_S);
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, t0 + BELL_DURATION_S);
    } else {
      gain.gain.linearRampToValueAtTime(0, t0 + BELL_DURATION_S);
    }

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Disconnect failures are safely ignored.
      }
    };

    osc.start(t0);
    osc.stop(t0 + BELL_DURATION_S);
    return true;
  } catch {
    // Non-throwing defense: terminal decode hot path must never fail.
    return false;
  }
}

export function resetBellAudioForTesting(factory) {
  audioContextFactory =
    factory ||
    (() => {
      const AudioContextClass =
        typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext);
      return AudioContextClass ? new AudioContextClass() : null;
    });
  audioContext = null;
  lastBellTimestamp = -Infinity;
  isBellEnabled = true;
  bellMode = 'always';
  isWindowFocusedState = true;
}

