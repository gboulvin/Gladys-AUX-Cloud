import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuxCloudClient,
  buildDirective,
  encryptLoginPayload,
  parseStdData,
} from '../src/aux/client.js';
import { AuxApiError, ERROR_KINDS, extractErrorCode, kindForCode } from '../src/aux/errors.js';
import {
  ACCOUNT,
  createFakeAuxCloud,
  makeAirConditioner,
  makeHeatPump,
} from './helpers/fakeAuxCloud.js';

function clientFor(cloud, password = ACCOUNT.password) {
  const client = new AuxCloudClient({ region: 'eu', fetchImpl: cloud.fetch });
  client.setCredentials(ACCOUNT.email, password);
  return client;
}

test('the login payload is zero-padded to a full block, even when already aligned', () => {
  const key = Buffer.alloc(16, 1);
  assert.equal(encryptLoginPayload(key, Buffer.alloc(10)).length, 16);
  assert.equal(encryptLoginPayload(key, Buffer.alloc(16)).length, 32);
});

test('login encrypts the credentials the way the cloud expects', async () => {
  const cloud = createFakeAuxCloud();
  const client = clientFor(cloud);
  await client.login();
  assert.ok(client.isLoggedIn());
  assert.equal(client.userId, 'user-1');
  const [login] = cloud.calls;
  assert.equal(login.endpoint, 'account/login');
  assert.ok(login.headers.timestamp && login.headers.token, 'timestamp and token headers');
});

test('a wrong password is an auth error', async () => {
  const cloud = createFakeAuxCloud();
  const client = clientFor(cloud, 'wrong');
  await assert.rejects(client.login(), (err) => err.kind === ERROR_KINDS.AUTH);
});

test('missing credentials fail before any request', async () => {
  const cloud = createFakeAuxCloud();
  const client = new AuxCloudClient({ fetchImpl: cloud.fetch });
  await assert.rejects(client.login(), (err) => err.kind === ERROR_KINDS.AUTH);
  assert.equal(cloud.calls.length, 0);
});

test('concurrent requests share a single login', async () => {
  const cloud = createFakeAuxCloud();
  const client = clientFor(cloud);
  await Promise.all([client.getFamilies(), client.getFamilies()]);
  assert.equal(cloud.calls.filter((call) => call.endpoint === 'account/login').length, 1);
});

test('an expired session logs in again and retries once', async () => {
  const cloud = createFakeAuxCloud();
  const client = clientFor(cloud);
  await client.getFamilies();
  cloud.expireNextRequest = true;
  const families = await client.getFamilies();
  assert.equal(families.length, 1);
  assert.equal(cloud.calls.filter((call) => call.endpoint === 'account/login').length, 2);
});

test('listDevices reads the account, the online states and the parameters', async () => {
  const offline = makeAirConditioner({ endpointId: 'ac0002', online: false });
  const cloud = createFakeAuxCloud({ devices: [makeAirConditioner(), offline, makeHeatPump()] });
  const client = clientFor(cloud);
  const devices = await client.listDevices();
  assert.equal(devices.length, 3);
  const ac = devices.find((d) => d.endpointId === 'ac0001');
  assert.equal(ac.online, true);
  assert.equal(ac.params.temp, 220);
  assert.equal(ac.familyId, 'family-1');
  const off = devices.find((d) => d.endpointId === 'ac0002');
  assert.equal(off.online, false);
  assert.equal(off.params, undefined, 'an offline unit is not queried');
});

test('setParams writes the values and refuses a parameter the product cannot write', async () => {
  const cloud = createFakeAuxCloud({ devices: [makeAirConditioner()] });
  const client = clientFor(cloud);
  const [device] = await client.listDevices();
  await client.setParams(device, { pwr: 0 });
  assert.equal(cloud.devices[0].params.pwr, 0);
  await assert.rejects(
    client.setParams(device, { envtemp: 10 }),
    (err) => err instanceof AuxApiError && err.kind === ERROR_KINDS.DEVICE,
  );
  await assert.rejects(client.setParams(device, { ac_mark: 6 }), /ac_mark/);
});

test('heat pump commands carry the protocol version when known', async () => {
  const hp = makeHeatPump({ extern: JSON.stringify({ ver: 2 }) });
  const cloud = createFakeAuxCloud({ devices: [hp] });
  const client = clientFor(cloud);
  const [device] = await client.listDevices();
  await client.setParams(device, { hp_pwr: 0 });
  const { directive } = JSON.parse(cloud.calls.at(-1).body);
  assert.deepEqual(directive.payload.params, ['hp_pwr', 'ver']);
});

test('the directive carries the device cookie re-encoded for control', () => {
  const directive = buildDirective(makeAirConditioner(), 'get', ['pwr']);
  const cookie = JSON.parse(
    Buffer.from(directive.endpoint.devicePairedInfo.cookie, 'base64').toString(),
  );
  assert.equal(cookie.device.aeskey, 'device-key');
  assert.equal(cookie.device.did, 'ac0001');
  assert.deepEqual(directive.payload.vals, [[{ val: 0, idx: 1 }]], 'dummy value of a single get');
  assert.throws(() => buildDirective(makeAirConditioner({ cookie: 'not-json' }), 'get'), /cookie/);
  assert.throws(() => buildDirective(makeAirConditioner(), 'set', ['pwr'], []), /same length/);
});

test('parseStdData flattens the params/vals shape', () => {
  assert.deepEqual(parseStdData('{"params":["pwr","temp"],"vals":[[{"val":1}],[{"val":220}]]}'), {
    pwr: 1,
    temp: 220,
  });
  assert.deepEqual(parseStdData({ pwr: 0 }), { pwr: 0 });
  assert.deepEqual(parseStdData(''), {});
});

test('error codes are classified', () => {
  assert.equal(extractErrorCode({ status: 0 }), undefined);
  assert.equal(extractErrorCode({ event: { payload: { status: -49025 } } }), -49025);
  assert.equal(kindForCode(-1006), ERROR_KINDS.AUTH);
  assert.equal(kindForCode(-30129), ERROR_KINDS.SESSION);
  assert.equal(kindForCode(-1036), ERROR_KINDS.RATE_LIMIT);
  assert.equal(kindForCode(12345), ERROR_KINDS.UNKNOWN);
});

test('a network failure is a network error', async () => {
  const client = new AuxCloudClient({
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  client.setCredentials(ACCOUNT.email, ACCOUNT.password);
  await assert.rejects(client.login(), (err) => err.kind === ERROR_KINDS.NETWORK);
});
