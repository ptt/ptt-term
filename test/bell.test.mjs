import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BELL_PITCH_HZ,
  DEFAULT_BELL_DURATION_MS,
  BELL_COOLDOWN_MS,
  canPlayBell,
  setTerminalBellEnabled,
  getTerminalBellMode,
  isTerminalBellEnabled,
  setWindowFocused,
  isWindowFocused,
  unlockAudioContext,
  playTerminalBell,
  resetBellAudioForTesting,
} from '../src/js/bell.js';

test('bell constants follow standard terminal conventions', () => {
  assert.equal(DEFAULT_BELL_PITCH_HZ, 750); // Linux console vt.c default pitch
  assert.equal(DEFAULT_BELL_DURATION_MS, 100); // VT100 standard 100ms
  assert.equal(BELL_COOLDOWN_MS, 100);
});

test('bell cooldown gating and enablement logic', () => {
  resetBellAudioForTesting();

  assert.equal(isTerminalBellEnabled(), true);
  assert.equal(canPlayBell(1000, { enabled: true, lastPlayedAt: 0, cooldownMs: 100 }), true);
  assert.equal(canPlayBell(1050, { enabled: true, lastPlayedAt: 1000, cooldownMs: 100 }), false);
  assert.equal(canPlayBell(1100, { enabled: true, lastPlayedAt: 1000, cooldownMs: 100 }), true);

  setTerminalBellEnabled(false);
  assert.equal(isTerminalBellEnabled(), false);
  assert.equal(canPlayBell(2000, { enabled: false, lastPlayedAt: 0, cooldownMs: 100 }), false);

  setTerminalBellEnabled(true);
  assert.equal(isTerminalBellEnabled(), true);
});

test('playTerminalBell synthesizes 750Hz acoustic chime via Web Audio and handles suspended/unsupported states', () => {
  let createdNodes = [];
  let resumed = false;
  let envelopeCalls = [];
  let freqValue = 0;

  class MockGainNode {
    constructor() {
      this.gain = {
        setValueAtTime(val, t) {
          envelopeCalls.push({ method: 'setValueAtTime', val, t });
        },
        linearRampToValueAtTime(val, t) {
          envelopeCalls.push({ method: 'linearRampToValueAtTime', val, t });
        },
        exponentialRampToValueAtTime(val, t) {
          envelopeCalls.push({ method: 'exponentialRampToValueAtTime', val, t });
        },
      };
    }
    connect() {}
    disconnect() {}
  }

  class MockOscillatorNode {
    constructor() {
      this.frequency = {
        value: 0,
        setValueAtTime(val) {
          freqValue = val;
        },
      };
    }
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }

  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'suspended';
      this.destination = {};
    }
    createOscillator() {
      const osc = new MockOscillatorNode();
      createdNodes.push(osc);
      return osc;
    }
    createGain() {
      const gain = new MockGainNode();
      createdNodes.push(gain);
      return gain;
    }
    resume() {
      resumed = true;
      this.state = 'running';
      return Promise.resolve();
    }
  }

  resetBellAudioForTesting(() => new MockAudioContext());

  // First bell should play, initialize 750Hz oscillator, configure envelope, and resume audio context
  const res1 = playTerminalBell(1000);
  assert.equal(res1, true);
  assert.equal(resumed, true);
  assert.equal(createdNodes.length, 2);
  assert.equal(freqValue, 750);
  // Verify acoustic envelope: rapid attack followed by exponential decay
  assert.equal(envelopeCalls.some(c => c.method === 'linearRampToValueAtTime'), true);
  assert.equal(envelopeCalls.some(c => c.method === 'exponentialRampToValueAtTime'), true);

  // Cooldown within 100ms should suppress playback
  const res2 = playTerminalBell(1050);
  assert.equal(res2, false);

  // Bell after cooldown period succeeds
  const res3 = playTerminalBell(1101);
  assert.equal(res3, true);

  // When AudioContext throws or unsupported, fails gracefully without throwing
  resetBellAudioForTesting(() => {
    throw new Error('Audio policy error');
  });
  const res4 = playTerminalBell(2000);
  assert.equal(res4, false);

  // Test unlockAudioContext resumes suspended audio context
  resumed = false;
  resetBellAudioForTesting(() => new MockAudioContext());
  assert.equal(unlockAudioContext(), true);
  assert.equal(resumed, true);
});

test('bell multi-mode handling and window focus gating', () => {
  resetBellAudioForTesting();

  // Default mode is 'always'
  assert.equal(getTerminalBellMode(), 'always');
  assert.equal(isTerminalBellEnabled(), true);

  // Background mode: suppresses playback when window is focused, plays when unfocused
  setTerminalBellEnabled('background');
  assert.equal(getTerminalBellMode(), 'background');
  assert.equal(isTerminalBellEnabled(), true);

  // When focused: suppressed
  assert.equal(canPlayBell(1000, { mode: 'background', isFocused: true, lastPlayedAt: 0, cooldownMs: 100 }), false);
  // When in background (unfocused): allowed
  assert.equal(canPlayBell(1000, { mode: 'background', isFocused: false, lastPlayedAt: 0, cooldownMs: 100 }), true);

  // setWindowFocused updates default focus detection
  setWindowFocused(true);
  assert.equal(isWindowFocused(), true);
  assert.equal(canPlayBell(1000, { mode: 'background', lastPlayedAt: 0, cooldownMs: 100 }), false);

  setWindowFocused(false);
  assert.equal(isWindowFocused(), false);
  assert.equal(canPlayBell(1000, { mode: 'background', lastPlayedAt: 0, cooldownMs: 100 }), true);

  // Off mode: suppressed regardless of focus
  setTerminalBellEnabled('off');
  assert.equal(getTerminalBellMode(), 'off');
  assert.equal(isTerminalBellEnabled(), false);
  assert.equal(canPlayBell(1000, { mode: 'off', isFocused: false, lastPlayedAt: 0, cooldownMs: 100 }), false);

  // Boolean compatibility: true -> always, false -> off
  setTerminalBellEnabled(true);
  assert.equal(getTerminalBellMode(), 'always');
  assert.equal(isTerminalBellEnabled(), true);

  setTerminalBellEnabled(false);
  assert.equal(getTerminalBellMode(), 'off');
  assert.equal(isTerminalBellEnabled(), false);
});
