import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';
import { AuxRuntime, MESSAGES } from '../src/runtime.js';
import { ACTIONS } from '../src/actions.js';
import { externalIdsOf } from '../src/devices/index.js';
import { FEATURE_KEYS } from '../src/devices/features.js';
import { makeAirConditioner, makeHeatPump } from './helpers/fakeAuxCloud.js';
import { startRuntime } from './helpers/runtime.js';

test('normalizeConfig applies the defaults and bounds the refresh interval', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(normalizeConfig({ poll_frequency: '5' }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
  assert.equal(normalizeConfig({ region: 'mars' }).region, 'eu');
  assert.equal(normalizeConfig({ username: '  me@example.com ' }).username, 'me@example.com');
});

test('without credentials the runtime reports what to do and calls nothing', async () => {
  const gladys = createFakeGladys();
  const runtime = new AuxRuntime(gladys, {
    createClient: () => ({ setCredentials() {} }),
  });
  runtime.configure(normalizeConfig());
  await runtime.refresh();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.MISSING_CREDENTIALS);
});

test('the first refresh publishes the devices, their states and transports', async () => {
  const { gladys, runtime } = await startRuntime({
    devices: [
      makeAirConditioner(),
      makeHeatPump(),
      makeAirConditioner({ endpointId: 'ac0002', online: false }),
    ],
  });
  assert.equal(runtime.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 3);
  assert.ok(gladys.fake.states.length > 0);
  const transports = gladys.fake.transports;
  assert.equal(transports.filter((t) => t.transport === 'cloud').length, 2);
  assert.equal(transports.filter((t) => t.transport === 'unreachable').length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a wrong password is reported in the Configuration screen', async () => {
  const { gladys, runtime } = await startRuntime({ config: { password: 'wrong' } });
  assert.equal(runtime.connected, false);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.BAD_CREDENTIALS);
});

test('a Gladys command is written to the unit and reflected at once', async () => {
  const { gladys, cloud, runtime } = await startRuntime({ devices: [makeAirConditioner()] });
  const ids = externalIdsOf(gladys, runtime.devices[0]);
  await runtime.setValue(ids.feature(FEATURE_KEYS.TARGET_TEMPERATURE), 24);
  assert.equal(cloud.devices[0].params.temp, 240);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURE_KEYS.TARGET_TEMPERATURE)), 24);
  await assert.rejects(runtime.setValue('ext:unknown:feature', 1), /Unknown AUX feature/);
});

test('a command to an offline unit fails with a clear message', async () => {
  const { gladys, runtime } = await startRuntime({
    devices: [makeAirConditioner({ online: false })],
  });
  const ids = externalIdsOf(gladys, runtime.devices[0]);
  await assert.rejects(runtime.setValue(ids.feature(FEATURE_KEYS.POWER), 1), /offline/);
});

test('later refreshes only read the cloud, and pick up the changes', async () => {
  const { gladys, cloud, runtime } = await startRuntime({ devices: [makeAirConditioner()] });
  const ids = externalIdsOf(gladys, runtime.devices[0]);
  cloud.devices[0].params.envtemp = 260;
  cloud.calls.length = 0;
  await runtime.refresh();
  assert.ok(!cloud.calls.some((call) => call.endpoint.includes('getfamilylist')), 'no re-listing');
  assert.equal(gladys.fake.lastState(ids.feature(FEATURE_KEYS.AMBIENT_TEMPERATURE)), 26);
});

test('the test_connection action says how many units were found', async () => {
  const { context } = await startRuntime({ devices: [makeAirConditioner(), makeHeatPump()] });
  const message = await ACTIONS.test_connection(context, { fields: {} });
  assert.match(message.en, /2 unit\(s\) found, 2 online/);
  for (const lang of ['fr', 'de', 'es']) {
    assert.ok(message[lang], `message in ${lang}`);
  }
});

test('the test_connection action reports a login failure', async () => {
  const { context } = await startRuntime({ config: { password: 'wrong' } });
  const message = await ACTIONS.test_connection(context, { fields: {} });
  assert.deepEqual(message, MESSAGES.BAD_CREDENTIALS);
});

test('a refresh started while another runs shares it', async () => {
  const { cloud, runtime } = await startRuntime({ devices: [makeAirConditioner()] });
  cloud.calls.length = 0;
  await Promise.all([runtime.refresh(), runtime.refresh()]);
  assert.equal(cloud.calls.filter((c) => c.endpoint === 'device/control/v2/querystate').length, 1);
});
