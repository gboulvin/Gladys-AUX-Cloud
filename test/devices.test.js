import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildDevice,
  buildDiscoveredDevices,
  commandFor,
  externalIdsOf,
  findDevice,
  isSupported,
  resolveFeature,
  statesOf,
} from '../src/devices/index.js';
import { FEATURE_KEYS, GLADYS_AC_FAN_SPEEDS, GLADYS_AC_MODES } from '../src/devices/features.js';
import {
  decodeV3TankTemperature,
  encodeAcTemperature,
  normalizeParams,
} from '../src/aux/profiles.js';
import { makeAirConditioner, makeHeatPump } from './helpers/fakeAuxCloud.js';

const gladys = createFakeGladys();

const stateOf = (states, ids, key) =>
  states.find((state) => state.device_feature_external_id === ids.feature(key))?.state;

test('Gladys accepts the discovery payload of every kind of unit', async () => {
  const fresh = createFakeGladys();
  const devices = [makeAirConditioner(), makeHeatPump()];
  await fresh.publishDiscoveredDevices(buildDiscoveredDevices(fresh, devices));
  assert.equal(fresh.fake.discoveredDevices.length, 2);
});

test('every feature carries the columns Gladys needs to create it', () => {
  for (const device of buildDiscoveredDevices(gladys, [makeAirConditioner(), makeHeatPump()])) {
    for (const feature of device.features) {
      const where = `${device.name} / ${feature.name}`;
      assert.ok(typeof feature.name === 'string' && feature.name.length > 0, `${where}: name`);
      assert.ok(Number.isFinite(feature.min), `${where}: min`);
      assert.ok(Number.isFinite(feature.max), `${where}: max`);
      assert.ok(feature.min <= feature.max, `${where}: min <= max`);
      assert.equal(typeof feature.read_only, 'boolean', `${where}: read_only`);
      assert.equal(typeof feature.has_feedback, 'boolean', `${where}: has_feedback`);
    }
  }
});

test('external ids are built from the cloud endpoint id', () => {
  const ac = buildDevice(gladys, makeAirConditioner());
  assert.ok(ac.external_id.endsWith(':ac:ac0001'));
  const hp = buildDevice(gladys, makeHeatPump());
  assert.ok(hp.external_id.endsWith(':heat-pump:hp0001'));
  assert.equal(ac.name, 'Living room');
});

test('optional features are only published when the unit reports them', () => {
  const keys = (device) =>
    buildDevice(gladys, device).features.map((f) => f.external_id.split(':').at(-1));
  const full = keys(makeAirConditioner());
  assert.ok(full.includes(FEATURE_KEYS.ECO) && full.includes(FEATURE_KEYS.DISPLAY));
  assert.ok(!full.includes(FEATURE_KEYS.CHILD_LOCK), 'not reported, not published');
  const vrv = keys(makeAirConditioner({ productId: '00000000000000000000000056ac0000' }));
  assert.ok(!vrv.includes(FEATURE_KEYS.SWING_HORIZONTAL), 'VRV units have no horizontal swing');
});

test('an unknown product is exposed only when it looks like an air conditioner', () => {
  assert.ok(isSupported(makeAirConditioner({ productId: 'unknown' })));
  assert.ok(!isSupported(makeAirConditioner({ productId: 'unknown', params: { foo: 1 } })));
});

test('AC states are converted to Gladys units and enums', () => {
  const device = makeAirConditioner();
  const ids = externalIdsOf(gladys, device);
  const states = statesOf(gladys, device);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.POWER), 1);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.MODE), GLADYS_AC_MODES.COOLING);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.TARGET_TEMPERATURE), 22);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.AMBIENT_TEMPERATURE), 24.5);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.FAN_SPEED), GLADYS_AC_FAN_SPEEDS.MID);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.SWING_HORIZONTAL), 1);
});

test('Gladys accepts the published states', async () => {
  const fresh = createFakeGladys();
  await fresh.publishStates([
    ...statesOf(fresh, makeAirConditioner()),
    ...statesOf(fresh, makeHeatPump()),
  ]);
});

test('an offline unit publishes no state', () => {
  assert.deepEqual(statesOf(gladys, makeAirConditioner({ online: false })), []);
});

test('heat pump states: tenths for the setpoints, whole degrees for an old tank sensor', () => {
  const device = makeHeatPump();
  const ids = externalIdsOf(gladys, device);
  const states = statesOf(gladys, device);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.WATER_TARGET_TEMPERATURE), 50);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.HEATING_TARGET_TEMPERATURE), 35);
  assert.equal(stateOf(states, ids, FEATURE_KEYS.WATER_TANK_TEMPERATURE), 47);
});

test('Gladys commands become AUX parameters', () => {
  const device = makeAirConditioner();
  assert.deepEqual(commandFor(device, FEATURE_KEYS.POWER, 0), { pwr: 0 });
  assert.deepEqual(commandFor(device, FEATURE_KEYS.MODE, GLADYS_AC_MODES.HEATING), { ac_mode: 1 });
  assert.deepEqual(commandFor(device, FEATURE_KEYS.MODE, GLADYS_AC_MODES.AUTO), { ac_mode: 4 });
  assert.deepEqual(commandFor(device, FEATURE_KEYS.TARGET_TEMPERATURE, 23.5), { temp: 235 });
  assert.deepEqual(commandFor(device, FEATURE_KEYS.TARGET_TEMPERATURE, 40), { temp: 320 });
  assert.deepEqual(commandFor(device, FEATURE_KEYS.FAN_SPEED, GLADYS_AC_FAN_SPEEDS.TURBO), {
    ac_mark: 4,
  });
  // A standard unit has no medium-low speed: the nearest one it has.
  assert.deepEqual(commandFor(device, FEATURE_KEYS.FAN_SPEED, GLADYS_AC_FAN_SPEEDS.LOW_MID), {
    ac_mark: 1,
  });
  assert.throws(
    () => commandFor(device, FEATURE_KEYS.AMBIENT_TEMPERATURE, 1),
    /cannot be controlled/,
  );
  assert.throws(() => commandFor(device, FEATURE_KEYS.MODE, 9), /Unknown/);
  const hp = makeHeatPump();
  assert.deepEqual(commandFor(hp, FEATURE_KEYS.WATER_TARGET_TEMPERATURE, 55), {
    hp_hotwater_temp: 550,
  });
});

test('features and devices are found back from their external ids', () => {
  const devices = [makeAirConditioner(), makeHeatPump()];
  const hpIds = externalIdsOf(gladys, devices[1]);
  const resolved = resolveFeature(gladys, devices, hpIds.feature(FEATURE_KEYS.WATER_POWER));
  assert.equal(resolved.device.endpointId, 'hp0001');
  assert.equal(resolved.feature.key, FEATURE_KEYS.WATER_POWER);
  assert.equal(findDevice(gladys, devices, hpIds.device).endpointId, 'hp0001');
  assert.equal(resolveFeature(gladys, devices, 'ext:other:thing'), undefined);
});

test('temperature encodings follow the AC Freedom app', () => {
  const halfDegree = makeAirConditioner({ productId: '0000000000000000000000001f620000' });
  assert.deepEqual(encodeAcTemperature(halfDegree, 22.5), { temp: 220, ac_tempdec: 1 });
  const fahrenheit = makeAirConditioner({ params: { tempunit: 2 } });
  assert.deepEqual(encodeAcTemperature(fahrenheit, 22.2), {
    temp: 220,
    tempunit: 2,
    ac_tempdec: 0,
    ac_tempconvert: 2,
  });
  const decoded = makeAirConditioner({
    productId: '0000000000000000000000001f620000',
    params: { temp: 220, ac_tempdec: 1 },
  });
  assert.equal(normalizeParams(decoded).temp, 225);
  assert.equal(decodeV3TankTemperature('00004f'), (0x4f - 32) * 10);
  assert.equal(decodeV3TankTemperature('zz'), undefined);
});
