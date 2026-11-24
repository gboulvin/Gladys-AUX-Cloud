import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SCENE_TRIGGERS, eventsBetween, snapshotOf } from '../src/triggers.js';
import { externalIdsOf } from '../src/devices/index.js';
import { makeAirConditioner, makeHeatPump } from './helpers/fakeAuxCloud.js';
import { startRuntime } from './helpers/runtime.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function assertDeclaredData(key, data) {
  const trigger = declarationOf('scene_triggers', key);
  const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
  for (const [dataKey, value] of Object.entries(data)) {
    assert.ok(declared.includes(dataKey), `${key}: data.${dataKey} is not declared`);
    assert.ok(value === null || typeof value !== 'object', `${key}: data.${dataKey} is flat`);
  }
  for (const field of trigger.fields.filter((f) => f.options)) {
    assert.ok(
      field.options.some((option) => option.value === data[field.key]),
      `${key}: data.${field.key} "${data[field.key]}" is one of the filter options`,
    );
  }
}

test('the first snapshot is a baseline and fires nothing', () => {
  assert.deepEqual(eventsBetween('ext:x', undefined, snapshotOf(makeAirConditioner())), []);
});

test('power, error and availability edges fire their trigger with declared data', () => {
  const before = snapshotOf(makeAirConditioner());
  const after = snapshotOf(
    makeAirConditioner({
      params: { ...makeAirConditioner().params, pwr: 0, err_flag: 1, ac_errcode1: 7 },
    }),
  );
  const events = eventsBetween('ext:aux:ac:1', before, after);
  assert.deepEqual(
    events.map((e) => e.key),
    [SCENE_TRIGGERS.POWER_CHANGED, SCENE_TRIGGERS.ERROR_DETECTED],
  );
  assert.deepEqual(events[0].data, { device: 'ext:aux:ac:1', state: 'off' });
  assert.deepEqual(events[1].data, { device: 'ext:aux:ac:1', error_code: 7 });
  for (const event of events) {
    assertDeclaredData(event.key, event.data);
  }
  const offline = snapshotOf(makeAirConditioner({ online: false, params: {} }));
  const lost = eventsBetween('ext:aux:ac:1', after, offline);
  assert.deepEqual(lost, [
    {
      key: SCENE_TRIGGERS.AVAILABILITY_CHANGED,
      data: { device: 'ext:aux:ac:1', status: 'offline' },
    },
  ]);
  assertDeclaredData(lost[0].key, lost[0].data);
});

test('an unchanged unit fires nothing', () => {
  const snapshot = snapshotOf(makeAirConditioner());
  assert.deepEqual(eventsBetween('ext:x', snapshot, { ...snapshot }), []);
});

test('the runtime publishes the scene event when a unit is turned off elsewhere', async () => {
  const { gladys, cloud, runtime } = await startRuntime({ devices: [makeAirConditioner()] });
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the baseline fires nothing');
  cloud.devices[0].params.pwr = 0;
  await runtime.refresh();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.sceneEvents[0].key, SCENE_TRIGGERS.POWER_CHANGED);
  assert.equal(
    gladys.fake.sceneEvents[0].data.device,
    externalIdsOf(gladys, runtime.devices[0]).device,
  );
});

test('set_climate writes every field in one command and returns the declared outputs', async () => {
  const { gladys, cloud, runtime, context } = await startRuntime({
    devices: [makeAirConditioner({ params: { ...makeAirConditioner().params, pwr: 0 } })],
  });
  const device = externalIdsOf(gladys, runtime.devices[0]).device;
  cloud.calls.length = 0;
  const outputs = await SCENE_ACTIONS.set_climate(context, {
    fields: { device, power: 'on', mode: 'heat', target_temperature: 21, fan_speed: 'quiet' },
  });
  assert.deepEqual(outputs, { applied: true });
  assert.equal(cloud.calls.filter((c) => c.endpoint === 'device/control/v2/sdkcontrol').length, 1);
  assert.deepEqual(
    { pwr: 1, ac_mode: 1, temp: 210, ac_mark: 5 },
    Object.fromEntries(
      ['pwr', 'ac_mode', 'temp', 'ac_mark'].map((key) => [key, cloud.devices[0].params[key]]),
    ),
  );
  const declared = keysOf(declarationOf('scene_actions', 'set_climate').outputs);
  assert.deepEqual(Object.keys(outputs), declared);
});

test('set_climate with no field to change sends nothing', async () => {
  const { gladys, runtime, context } = await startRuntime({ devices: [makeAirConditioner()] });
  const device = externalIdsOf(gladys, runtime.devices[0]).device;
  assert.deepEqual(await SCENE_ACTIONS.set_climate(context, { fields: { device } }), {
    applied: false,
  });
});

test('set_climate refuses a heat pump, set_hot_water an air conditioner', async () => {
  const { gladys, runtime, context } = await startRuntime({
    devices: [makeAirConditioner(), makeHeatPump()],
  });
  const [ac, hp] = runtime.devices.map((d) => externalIdsOf(gladys, d).device);
  await assert.rejects(SCENE_ACTIONS.set_climate(context, { fields: { device: hp, power: 'on' } }));
  await assert.rejects(
    SCENE_ACTIONS.set_hot_water(context, { fields: { device: ac, power: 'on' } }),
  );
  await assert.rejects(
    SCENE_ACTIONS.set_climate(context, { fields: { device: 'ext:nope' } }),
    /Unknown/,
  );
});

test('set_hot_water drives the heat pump hot water', async () => {
  const { gladys, cloud, runtime, context } = await startRuntime({ devices: [makeHeatPump()] });
  const device = externalIdsOf(gladys, runtime.devices[0]).device;
  const outputs = await SCENE_ACTIONS.set_hot_water(context, {
    fields: { device, power: 'off', target_temperature: 55, boost: 'on' },
  });
  assert.deepEqual(outputs, { applied: true });
  assert.equal(cloud.devices[0].params.hp_pwr, 0);
  assert.equal(cloud.devices[0].params.hp_hotwater_temp, 550);
  assert.equal(cloud.devices[0].params.hp_fast_hotwater, 1);
});

test('turn_off_all turns off the units that are on', async () => {
  const { cloud, context } = await startRuntime({
    devices: [
      makeAirConditioner(),
      makeAirConditioner({
        endpointId: 'ac0002',
        params: { ...makeAirConditioner().params, pwr: 0 },
      }),
      makeHeatPump(),
    ],
  });
  const outputs = await SCENE_ACTIONS.turn_off_all(context, { fields: {} });
  assert.deepEqual(outputs, { turned_off: 2 });
  assert.equal(cloud.devices[0].params.pwr, 0);
  assert.equal(cloud.devices[2].params.ac_pwr, 0);
});
