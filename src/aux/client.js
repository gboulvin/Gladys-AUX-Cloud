// -----------------------------------------------------------------------------
// AUX Cloud (AC Freedom) client.
//
// AC Freedom runs on the BroadLink DNA cloud. There is no public API: this
// client speaks the protocol of the mobile app, as reverse-engineered by
// ha-aux-cloud (https://github.com/maeek/ha-aux-cloud, MIT):
//   - login: the JSON body is AES-128-CBC encrypted (zero padding) with a key
//     derived from the request timestamp, the password is SHA-1 salted;
//   - every later request carries the `loginsession` and `userid` headers;
//   - devices are read and controlled with "DNA.KeyValueControl" directives
//     carrying the per-device cookie (terminal id + AES key) the cloud gave.
//
// Only the HTTP channel is used: the integration polls, and a command is a
// single HTTP call. Credentials are kept in memory only and never logged.
// -----------------------------------------------------------------------------

import { createCipheriv, createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import {
  AuxApiError,
  ERROR_KINDS,
  VERSIONED_QUERY_REQUIRED,
  raiseForCloudResponse,
  raiseForHttpStatus,
} from './errors.js';
import {
  DEVICE_KINDS,
  decodeCookie,
  getProfile,
  getProtocolVersion,
  invalidCommandParameter,
  isV3HeatPump,
  normalizeParams,
} from './profiles.js';

const logger = createLogger({ name: 'aux-cloud' });

// Constants of the AC Freedom Android app (public, shipped in every APK).
const TIMESTAMP_TOKEN_ENCRYPT_KEY = 'kdixkdqp54545^#*';
const PASSWORD_ENCRYPT_KEY = '4969fj#k23#';
const BODY_ENCRYPT_KEY = 'xgx3d*fe3478$ukx';
const AES_INITIAL_VECTOR = Buffer.from(
  [-22, -86, -86, 58, -69, 88, 98, -94, 25, 24, -75, 119, 29, 22, 21, -86].map(
    (byte) => (byte + 256) % 256,
  ),
);
const LICENSE =
  'PAFbJJ3WbvDxH5vvWezXN5BujETtH/iuTtIIW5CE/SeHN7oNKqnEajgljTcL0fBQQWM0XAAAAAAnBhJyhMi7zIQMsUcwR/PEwGA3uB5HLOnr+xRrci+FwHMkUtK7v4yo0ZHa+jPvb6djelPP893k7SagmffZmOkLSOsbNs8CAqsu8HuIDs2mDQAAAAA=';
const LICENSE_ID = '3c015b249dd66ef0f11f9bef59ecd737';
const COMPANY_ID = '48eb1b36cf0202ab2ef07b880ecda60d';
const APP_VERSION = '2.2.10.456537160';
const USER_AGENT = 'Dalvik/2.1.0 (Linux; U; Android 12; SM-G991B Build/SP1A.210812.016)';

export const REGIONS = {
  eu: 'https://app-service-deu-f0e9ebbb.smarthomecs.de',
  usa: 'https://app-service-usa-fd7cc04c.smarthomecs.com',
  cn: 'https://app-service-chn-31a93883.ibroadlink.com',
  rus: 'https://app-service-rus-b8bbc3be.smarthomecs.com',
};

const CONTROL_ENDPOINT = 'device/control/v2/sdkcontrol';
const REQUEST_TIMEOUT_MS = 15_000;
// Parameter queries in flight at once: the cloud rate-limits bursts.
const QUERY_CONCURRENCY = 4;

// v3 heat pumps answer -49025 to an unversioned query: these are the batches
// the app sends them instead.
const V3_HEAT_PUMP_QUERIES = [
  ['ver'],
  ['ver', 'key_states', 'common_states'],
  ['ver', 'hp_auto_wtemp', 'water_tank_dif', 'eco'],
  ['ver', 'mute'],
];

const md5 = (text) => createHash('md5').update(text).digest();
const md5Hex = (text) => createHash('md5').update(text).digest('hex');
const sha1Hex = (text) => createHash('sha1').update(text).digest('hex');

/**
 * Encrypt the login payload: AES-128-CBC with the vendor's zero padding (a
 * full block of zeros when the length is already a multiple of 16).
 */
export function encryptLoginPayload(key, data) {
  const padLength = 16 - (data.length % 16);
  const padded = Buffer.concat([data, Buffer.alloc(padLength)]);
  const cipher = createCipheriv('aes-128-cbc', key, AES_INITIAL_VECTOR);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

function directiveHeader(namespace, name, messageIdPrefix, extra = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    namespace,
    name,
    interfaceVersion: '2',
    senderId: 'sdk',
    messageId: `${messageIdPrefix}-${timestamp}`,
    ...extra,
  };
}

/**
 * Build the KeyValueControl directive reading (`get`) or writing (`set`)
 * parameters of one device.
 */
export function buildDirective(device, act, params = [], vals = []) {
  if (act === 'set' && params.length !== vals.length) {
    throw new Error('params and vals must have the same length');
  }
  const cookie = decodeCookie(device.cookie);
  const terminalId = cookie?.terminalid;
  const aesKey = cookie?.aeskey;
  if (
    (typeof terminalId !== 'string' && typeof terminalId !== 'number') ||
    String(terminalId) === '' ||
    typeof aesKey !== 'string' ||
    !aesKey
  ) {
    throw new AuxApiError('AUX device cookie is missing its control metadata', {
      kind: ERROR_KINDS.DEVICE,
      endpoint: CONTROL_ENDPOINT,
    });
  }
  for (const field of ['endpointId', 'productId', 'mac', 'devSession', 'devicetypeFlag']) {
    if (!(field in device)) {
      throw new AuxApiError(`AUX device metadata is missing ${field}`, {
        kind: ERROR_KINDS.DEVICE,
        endpoint: CONTROL_ENDPOINT,
      });
    }
  }
  const mappedCookie = Buffer.from(
    JSON.stringify({
      device: {
        id: terminalId,
        key: aesKey,
        devSession: device.devSession,
        aeskey: aesKey,
        did: device.endpointId,
        pid: device.productId,
        mac: device.mac,
      },
    }),
  ).toString('base64');

  const payload = { act, params: [...params], vals: [...vals], did: device.endpointId };
  // The app sends a dummy value with a single-parameter read.
  if (params.length === 1 && act === 'get') {
    payload.vals = [[{ val: 0, idx: 1 }]];
  }
  return {
    header: directiveHeader('DNA.KeyValueControl', 'KeyValueControl', device.endpointId, {
      timstamp: `${Math.floor(Date.now() / 1000)}`,
    }),
    endpoint: {
      devicePairedInfo: {
        did: device.endpointId,
        pid: device.productId,
        mac: device.mac,
        devicetypeflag: device.devicetypeFlag,
        cookie: mappedCookie,
      },
      endpointId: device.endpointId,
      cookie: {},
      devSession: device.devSession,
    },
    payload,
  };
}

/**
 * Turn the `{ params: [...], vals: [[{ val }]] }` shape into a plain object.
 */
export function parseStdData(data) {
  if (!data) {
    return {};
  }
  const response = typeof data === 'string' ? JSON.parse(data) : data;
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return {};
  }
  if (!('params' in response) || !('vals' in response)) {
    return { ...response };
  }
  const result = {};
  response.params.forEach((param, index) => {
    const value = response.vals?.[index]?.[0]?.val;
    if (value !== undefined) {
      result[param] = value;
    }
  });
  return result;
}

/**
 * Run async tasks with a concurrency cap; resolves like Promise.allSettled.
 */
async function settleWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export class AuxCloudClient {
  /**
   * @param {{ region?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
   */
  constructor({
    region = 'eu',
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {}) {
    this.region = REGIONS[region] ? region : 'eu';
    this.baseUrl = REGIONS[this.region];
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.credentials = undefined;
    this.loginSession = undefined;
    this.userId = undefined;
    this.loginPromise = undefined;
  }

  setCredentials(username, password) {
    this.credentials = {
      username: String(username ?? '').trim(),
      password: String(password ?? ''),
    };
    this.loginSession = undefined;
    this.userId = undefined;
  }

  hasCredentials() {
    return Boolean(this.credentials?.username && this.credentials?.password);
  }

  isLoggedIn() {
    return Boolean(this.loginSession && this.userId);
  }

  headers(extra = {}) {
    return {
      'Content-Type': 'application/x-java-serialized-object',
      licenseId: LICENSE_ID,
      lid: LICENSE_ID,
      language: 'en',
      appVersion: APP_VERSION,
      'User-Agent': USER_AGENT,
      system: 'android',
      appPlatform: 'android',
      loginsession: this.loginSession ?? '',
      userid: this.userId ?? '',
      ...extra,
    };
  }

  async requestOnce(endpoint, { headers, body, query }) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    let response;
    let text;
    try {
      response = await this.fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (err) {
      throw new AuxApiError(`AUX Cloud is unreachable (${err.name})`, {
        kind: ERROR_KINDS.NETWORK,
        endpoint,
      });
    }
    raiseForHttpStatus(response.status, endpoint);
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new AuxApiError('AUX Cloud returned invalid JSON', {
        kind: ERROR_KINDS.SERVER,
        httpStatus: response.status,
        endpoint,
      });
    }
    raiseForCloudResponse(json, endpoint);
    return json;
  }

  /**
   * POST one request, logging in first when needed and once more on an
   * expired session.
   */
  async request(endpoint, { headers = {}, data, raw, query } = {}) {
    if (!this.isLoggedIn()) {
      await this.login();
    }
    const body = raw !== undefined ? raw : data !== undefined ? JSON.stringify(data) : undefined;
    const sessionAtRequest = this.loginSession;
    try {
      return await this.requestOnce(endpoint, { headers: this.headers(headers), body, query });
    } catch (err) {
      if (!(err instanceof AuxApiError) || err.kind !== ERROR_KINDS.SESSION) {
        throw err;
      }
      logger.debug('AUX Cloud session expired, logging in again');
      if (this.loginSession === sessionAtRequest) {
        this.loginSession = undefined;
        this.userId = undefined;
      }
      if (!this.isLoggedIn()) {
        await this.login();
      }
      return this.requestOnce(endpoint, { headers: this.headers(headers), body, query });
    }
  }

  /**
   * Log in with the stored credentials. Concurrent callers share one login.
   */
  async login() {
    if (!this.hasCredentials()) {
      throw new AuxApiError('AUX Cloud credentials are missing', { kind: ERROR_KINDS.AUTH });
    }
    if (!this.loginPromise) {
      this.loginPromise = this.doLogin().finally(() => {
        this.loginPromise = undefined;
      });
    }
    return this.loginPromise;
  }

  async doLogin() {
    const { username, password } = this.credentials;
    const timestamp = `${Date.now() / 1000}`;
    const shaPassword = sha1Hex(`${password}${PASSWORD_ENCRYPT_KEY}`);
    const identity = username.includes('@') ? { email: username } : { phone: username };
    const payload = JSON.stringify({
      ...identity,
      password: shaPassword,
      companyid: COMPANY_ID,
      lid: LICENSE_ID,
    });
    const token = md5Hex(`${payload}${BODY_ENCRYPT_KEY}`);
    const key = md5(`${timestamp}${TIMESTAMP_TOKEN_ENCRYPT_KEY}`);
    const json = await this.requestOnce('account/login', {
      headers: this.headers({ timestamp, token }),
      body: encryptLoginPayload(key, Buffer.from(payload)),
    });
    if (typeof json.loginsession !== 'string' || typeof json.userid !== 'string') {
      throw new AuxApiError('AUX Cloud login response did not include an identity', {
        kind: ERROR_KINDS.SERVER,
        endpoint: 'account/login',
      });
    }
    this.loginSession = json.loginsession;
    this.userId = json.userid;
    logger.info('Logged in to AUX Cloud');
  }

  async getFamilies() {
    const json = await this.request('appsync/group/member/getfamilylist');
    const families = json?.data?.familyList;
    if (!Array.isArray(families)) {
      throw new AuxApiError('Invalid AUX Cloud family response', { kind: ERROR_KINDS.SERVER });
    }
    return families;
  }

  async getFamilyDevices(familyId, shared = false) {
    const endpoint = shared
      ? 'appsync/group/sharedev/querylist?querytype=shared'
      : 'appsync/group/dev/query?action=select';
    // The query string is part of the endpoint path for these two calls.
    const json = await this.request(endpoint, {
      raw: shared ? '{"endpointId":""}' : '{"pids":[]}',
      headers: { familyid: familyId },
    });
    const data = json?.data;
    if (Array.isArray(data?.endpoints)) {
      return data.endpoints;
    }
    if (Array.isArray(data?.shareFromOther)) {
      return data.shareFromOther
        .filter((entry) => entry?.devinfo && typeof entry.devinfo === 'object')
        .map((entry) => entry.devinfo);
    }
    return [];
  }

  /**
   * Online state of a batch of devices: Map endpointId -> 0 (offline) / 1 (online).
   */
  async queryStates(devices) {
    if (devices.length === 0) {
      return new Map();
    }
    const json = await this.request('device/control/v2/querystate', {
      data: {
        directive: {
          header: directiveHeader('DNA.QueryState', 'queryState', this.userId ?? '', {
            messageType: 'controlgw.batch',
          }),
          payload: {
            studata: devices.map((device) => ({
              did: device.endpointId,
              devSession: device.devSession,
            })),
            msgtype: 'batch',
          },
        },
      },
    });
    const payload = json?.event?.payload;
    if (payload?.status !== 0 || !Array.isArray(payload?.data)) {
      throw new AuxApiError('Invalid AUX Cloud device-state response', {
        kind: ERROR_KINDS.SERVER,
      });
    }
    return new Map(
      payload.data
        .filter((entry) => typeof entry?.did === 'string')
        .map((entry) => [entry.did, Number.isInteger(entry.state) ? entry.state : 0]),
    );
  }

  async control(device, act, params, vals) {
    const json = await this.request(CONTROL_ENDPOINT, {
      data: { directive: buildDirective(device, act, params, vals) },
      query: { license: LICENSE },
    });
    const event = json?.event;
    if (!event || typeof event !== 'object') {
      throw new AuxApiError('AUX device control response has no event', {
        kind: ERROR_KINDS.SERVER,
        endpoint: CONTROL_ENDPOINT,
      });
    }
    if (event.header?.name !== 'Response') {
      throw new AuxApiError('Unexpected AUX device control response', {
        kind: ERROR_KINDS.SERVER,
        endpoint: CONTROL_ENDPOINT,
      });
    }
    try {
      return parseStdData(event.payload?.data);
    } catch {
      throw new AuxApiError('Invalid AUX device control data', {
        kind: ERROR_KINDS.SERVER,
        endpoint: CONTROL_ENDPOINT,
      });
    }
  }

  /**
   * Read parameters of one device (all of them for an empty list).
   */
  async getParams(device, params = []) {
    return this.control(device, 'get', params);
  }

  /**
   * Read every parameter of an online device, merging the query batches its
   * profile needs, and normalize the result in place on `device.params`.
   */
  async refreshParams(device) {
    const profile = getProfile(device.productId);
    const queries =
      profile.kind === DEVICE_KINDS.HEAT_PUMP && isV3HeatPump(device)
        ? V3_HEAT_PUMP_QUERIES
        : [[], profile.specialQueries ?? []].filter((query, index) => index === 0 || query.length);
    let results = await settleWithConcurrency(
      queries.map((query) => () => this.getParams(device, query)),
      QUERY_CONCURRENCY,
    );
    if (
      profile.kind === DEVICE_KINDS.HEAT_PUMP &&
      !isV3HeatPump(device) &&
      results.some((r) => r.status === 'rejected' && r.reason?.code === VERSIONED_QUERY_REQUIRED)
    ) {
      results = await settleWithConcurrency(
        V3_HEAT_PUMP_QUERIES.map((query) => () => this.getParams(device, query)),
        QUERY_CONCURRENCY,
      );
    }
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    if (fulfilled.length === 0) {
      throw results[0].reason;
    }
    const params = Object.assign({}, ...fulfilled.map((r) => r.value));
    if (Number.isInteger(params.ver) && params.ver > 0) {
      device.protocolVersion = params.ver;
    }
    device.params = params;
    normalizeParams(device);
    return device.params;
  }

  /**
   * List every personal and shared device of the account, with its online
   * state (`device.online`) and, for online devices, its parameters.
   */
  async listDevices() {
    const families = await this.getFamilies();
    const lists = await settleWithConcurrency(
      families.flatMap((family) =>
        [false, true].map((shared) => async () => {
          const devices = await this.getFamilyDevices(family.familyid, shared);
          return devices.map((device) => ({
            ...device,
            familyId: device.familyId ?? family.familyid,
          }));
        }),
      ),
      QUERY_CONCURRENCY,
    );
    const seen = new Set();
    const devices = [];
    for (const result of lists) {
      if (result.status === 'rejected') {
        logger.warn(`An AUX family device list could not be read (${result.reason?.message})`);
        continue;
      }
      for (const device of result.value) {
        if (!device?.endpointId || seen.has(device.endpointId)) {
          continue;
        }
        seen.add(device.endpointId);
        devices.push(device);
      }
    }
    if (devices.length === 0 && lists.some((r) => r.status === 'rejected')) {
      throw lists.find((r) => r.status === 'rejected').reason;
    }
    await this.refreshDevices(devices);
    return devices;
  }

  /**
   * Refresh the online state and the parameters of known devices, in place.
   */
  async refreshDevices(devices) {
    const states = await this.queryStates(devices);
    const online = [];
    for (const device of devices) {
      device.online = states.get(device.endpointId) === 1;
      if (device.online) {
        online.push(device);
      }
    }
    const results = await settleWithConcurrency(
      online.map((device) => () => this.refreshParams(device)),
      QUERY_CONCURRENCY,
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn(
          `Parameters of an AUX device could not be read (${result.reason?.message ?? result.reason})`,
        );
        online[index].params = online[index].params ?? {};
      }
    });
    return devices;
  }

  /**
   * Write parameters to one device. `values` maps a parameter to a number.
   * Resolves the parameters the device echoed back (or `values`).
   */
  async setParams(device, values) {
    const profile = getProfile(device.productId);
    const invalid = invalidCommandParameter(profile, values);
    if (invalid) {
      throw new AuxApiError(`This AUX product does not support setting ${invalid}`, {
        kind: ERROR_KINDS.DEVICE,
        endpoint: CONTROL_ENDPOINT,
      });
    }
    const params = Object.keys(values);
    const vals = Object.values(values).map((value) => [{ idx: 1, val: value }]);
    if (profile.kind === DEVICE_KINDS.HEAT_PUMP) {
      const version = getProtocolVersion(device);
      if (version !== undefined && !params.includes('ver')) {
        params.push('ver');
        vals.push([{ idx: 1, val: version }]);
      }
    }
    const echoed = await this.control(device, 'set', params, vals);
    return Object.keys(echoed).length > 0 ? echoed : values;
  }
}
