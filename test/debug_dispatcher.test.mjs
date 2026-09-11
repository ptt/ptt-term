import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from '../src/js/event.js';

test('EventEmitter: basic on, emit, off, and subscribe', () => {
  const ee = new EventEmitter();
  const received = [];

  assert.equal(ee._singleType, null);
  assert.equal(ee._events, null);

  const handler = (event) => received.push(event);
  const unsubscribe = ee.subscribe('touch', handler);

  // Single slot verification
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._singleListener, handler);
  assert.equal(ee._events, null);

  ee.emit('touch', 'event-1');
  assert.deepEqual(received, ['event-1']);

  // Unsubscribe using returned function
  unsubscribe();
  assert.equal(ee._singleType, null);
  assert.equal(ee._singleListener, null);

  ee.emit('touch', 'event-2');
  assert.deepEqual(received, ['event-1'], 'Handler should not be called after unsubscribe');
});

test('EventEmitter: promotion to Map and demotion back to single slot', () => {
  const ee = new EventEmitter();
  const log = [];

  const h1 = (e) => log.push('h1:' + e);
  const h2 = (e) => log.push('h2:' + e);

  ee.on('touch', h1);
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._events, null);

  // Adding second listener promotes to Map
  ee.on('touch', h2);
  assert.equal(ee._singleType, null);
  assert.ok(ee._events instanceof Map);
  assert.equal(ee.listenerCount('touch'), 2);

  ee.emit('touch', 'test1');
  assert.deepEqual(log, ['h1:test1', 'h2:test1']);

  // Removing one demotes back to single slot
  ee.off('touch', h2);
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._singleListener, h1);
  assert.equal(ee._events, null);
  assert.equal(ee.listenerCount('touch'), 1);

  ee.emit('touch', 'test2');
  assert.deepEqual(log, ['h1:test1', 'h2:test1', 'h1:test2']);

  // Removing last listener clears completely
  ee.off('touch', h1);
  assert.equal(ee._singleType, null);
  assert.equal(ee._singleListener, null);
  assert.equal(ee._events, null);
  assert.equal(ee.listenerCount('touch'), 0);
});

test('EventEmitter: multiple event types promotion and demotion', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('touch', (e) => log.push('touch:' + e));
  ee.on('network', (e) => log.push('net:' + e));

  assert.ok(ee._events instanceof Map, 'Multiple types must promote to Map');
  assert.equal(ee._events.size, 2);

  ee.emit('touch', 'tap');
  ee.emit('network', 'connected');
  assert.deepEqual(log, ['touch:tap', 'net:connected']);

  // Remove network -> only 1 type with 1 listener remains -> demotes to single slot!
  ee.removeAllListeners('network');
  assert.equal(ee._singleType, 'touch');
  assert.equal(ee._events, null);
});

test('EventEmitter: once listener executes only once and cleans up', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.once('init', (val) => log.push(val));
  assert.equal(ee._singleType, 'init');

  ee.emit('init', 100);
  ee.emit('init', 200);

  assert.deepEqual(log, [100]);
  assert.equal(ee._singleType, null);
});

test('EventEmitter: wildcard (*) listener receives all events', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('*', (data, type) => log.push({ type, data }));

  ee.emit('touch', 'tap');
  ee.emit('custom', 42);

  assert.deepEqual(log, [
    { type: 'touch', data: 'tap' },
    { type: 'custom', data: 42 },
  ]);
});

test('EventEmitter: error in one listener does not crash emit or stop others', () => {
  const ee = new EventEmitter();
  const log = [];

  ee.on('touch', () => {
    throw new Error('Listener error');
  });
  ee.on('touch', (data) => log.push(data));

  assert.doesNotThrow(() => {
    ee.emit('touch', 'ok');
  });
  assert.deepEqual(log, ['ok']);
});

test('EventEmitter: safe no-ops and invalid arguments', () => {
  const ee = new EventEmitter();
  assert.doesNotThrow(() => {
    ee.emit('non_existent', 123);
    ee.off('non_existent', () => {});
    ee.on('test', null);
    assert.equal(ee.listenerCount('test'), 0);
  });
});
