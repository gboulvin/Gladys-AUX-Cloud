// -----------------------------------------------------------------------------
// A fake AUX cloud for the tests: a `fetch` implementation answering the
// endpoints the client uses, from an in-memory account. Tests never touch the
// network.
// -----------------------------------------------------------------------------

import { createDecipheriv, createHash } from 'node:crypto';

export const ACCOUNT = { email: 'me@example.com', password: 'secret' };

const PASSWORD_ENCRYPT_KEY = '4969fj#k23#';
const TIMESTAMP_TOKEN_ENCRYPT_KEY = 'kdixkdqp54545^#*';
const BODY_ENCRYPT_KEY = 'xgx3d*fe3478$ukx';
const IV = Buffer.from(
  [-22, -86, -86, 58, -69, 88, 98, -94, 25, 24, -75, 119, 29, 22, 21, -86].map(
    (byte) => (byte + 256) % 256,
  ),
);

export function cookieFor(terminalid = 1, aeskey = 'device-key') {
  return Buffer.from(JSON.stringify({ terminalid, aeskey })).toString('base64');
}

export const AC_PRODUCT_ID = '000000000000000000000000c0620000';
export const HEAT_PUMP_PRODUCT_ID = '000000000000000000000000c3aa0000';

export function makeAirConditioner(overrides = {}) {
  return {
    endpointId: 'ac0001',
    productId: AC_PRODUCT_ID,
    friendlyName: 'Living room',
    mac: 'aa:bb:cc:dd:ee:01',
    devSession: 'session-ac',
    devicetypeFlag: 1,
    cookie: cookieFor(),
    online: true,
    params: {
      pwr: 1,
      ac_mode: 0,
      temp: 220,
      envtemp: 245,
      ac_mark: 2,
      ac_vdir: 0,
      ac_hdir: 1,
      ecomode: 0,
      ac_slp: 0,
      scrdisp: 1,
      err_flag: 0,
      ac_errcode1: 0,
    },
    ...overrides,
  };
}

export function makeHeatPump(overrides = {}) {
  return {
    endpointId: 'hp0001',
    productId: HEAT_PUMP_PRODUCT_ID,
    friendlyName: 'Heat pump',
    mac: 'aa:bb:cc:dd:ee:02',
    devSession: 'session-hp',
    devicetypeFlag: 1,
    cookie: cookieFor(2),
    online: true,
    params: {
      ac_pwr: 1,
      ac_temp: 350,
      hp_pwr: 1,
      hp_hotwater_temp: 500,
      hp_water_tank_temp: 47,
      hp_fast_hotwater: 0,
      qtmode: 0,
      ecomode: 0,
      ac_mode: 4,
      err_flag: 0,
    },
    ...overrides,
  };
}

function decryptLogin(body, timestamp) {
  const key = createHash('md5').update(`${timestamp}${TIMESTAMP_TOKEN_ENCRYPT_KEY}`).digest();
  const decipher = createDecipheriv('aes-128-cbc', key, IV);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  return JSON.parse(plain.toString('utf8').replace(/\0+$/, ''));
}

const json = (body, status = 200) => ({
  status,
  async text() {
    return JSON.stringify(body);
  },
});

/**
 * @param {{ devices?: object[], password?: string }} [options]
 */
export function createFakeAuxCloud({ devices = [], password = ACCOUNT.password } = {}) {
  const cloud = {
    // Cloud-side devices: what the account holds. `online` and `params` are
    // the truth the client reads.
    devices: devices.map((device) => structuredClone(device)),
    calls: [],
    sessions: new Set(),
    expireNextRequest: false,
    failNext: undefined,
  };

  const find = (did) => cloud.devices.find((device) => device.endpointId === did);

  cloud.fetch = async (url, init) => {
    const { pathname } = new URL(url);
    const endpoint = pathname.slice(1);
    const headers = init.headers;
    cloud.calls.push({ endpoint, headers, body: init.body });

    if (cloud.failNext) {
      const failure = cloud.failNext;
      cloud.failNext = undefined;
      return json(failure);
    }

    if (endpoint === 'account/login') {
      const payload = decryptLogin(init.body, headers.timestamp);
      const expectedToken = createHash('md5')
        .update(`${JSON.stringify(payload)}${BODY_ENCRYPT_KEY}`)
        .digest('hex');
      const expectedPassword = createHash('sha1')
        .update(`${password}${PASSWORD_ENCRYPT_KEY}`)
        .digest('hex');
      if (headers.token !== expectedToken || payload.password !== expectedPassword) {
        return json({ status: -1006, msg: 'bad credentials' });
      }
      const session = `session-${cloud.sessions.size + 1}`;
      cloud.sessions.add(session);
      return json({ status: 0, loginsession: session, userid: 'user-1' });
    }

    if (!cloud.sessions.has(headers.loginsession)) {
      return json({ status: -1009 });
    }
    if (cloud.expireNextRequest) {
      cloud.expireNextRequest = false;
      cloud.sessions.delete(headers.loginsession);
      return json({ status: -30129 });
    }

    switch (endpoint) {
      case 'appsync/group/member/getfamilylist':
        return json({ status: 0, data: { familyList: [{ familyid: 'family-1' }] } });
      case 'appsync/group/dev/query':
        return json({
          status: 0,
          data: {
            endpoints: cloud.devices.map((device) => {
              const listed = { ...device };
              delete listed.online;
              delete listed.params;
              return listed;
            }),
          },
        });
      case 'appsync/group/sharedev/querylist':
        return json({ status: 0, data: { shareFromOther: [] } });
      case 'device/control/v2/querystate': {
        const { studata } = JSON.parse(init.body).directive.payload;
        return json({
          event: {
            payload: {
              status: 0,
              data: studata.map(({ did }) => ({ did, state: find(did)?.online ? 1 : 0 })),
            },
          },
        });
      }
      case 'device/control/v2/sdkcontrol': {
        const { directive } = JSON.parse(init.body);
        const device = find(directive.endpoint.endpointId);
        if (!device || !device.online) {
          return json({ event: { payload: { status: -3118 } } });
        }
        const { act, params, vals } = directive.payload;
        let data;
        if (act === 'set') {
          params.forEach((param, index) => {
            device.params[param] = vals[index][0].val;
          });
          data = { params, vals };
        } else {
          const keys = params.length > 0 ? params : Object.keys(device.params);
          const known = keys.filter((key) => key in device.params);
          data = {
            params: known,
            vals: known.map((key) => [{ idx: 1, val: device.params[key] }]),
          };
        }
        return json({
          event: {
            header: { name: 'Response' },
            payload: { status: 0, data: JSON.stringify(data) },
          },
        });
      }
      default:
        return json({ status: -1 }, 404);
    }
  };

  return cloud;
}
