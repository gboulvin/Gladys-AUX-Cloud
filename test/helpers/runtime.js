// Build a runtime wired to a fake Gladys and a fake AUX cloud.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AuxCloudClient } from '../../src/aux/client.js';
import { normalizeConfig } from '../../src/config.js';
import { AuxRuntime } from '../../src/runtime.js';
import { ACCOUNT, createFakeAuxCloud } from './fakeAuxCloud.js';

export async function startRuntime({ devices = [], config = {} } = {}) {
  const gladys = createFakeGladys();
  const cloud = createFakeAuxCloud({ devices });
  const runtime = new AuxRuntime(gladys, {
    createClient: (cfg) => new AuxCloudClient({ region: cfg.region, fetchImpl: cloud.fetch }),
  });
  runtime.configure(
    normalizeConfig({ username: ACCOUNT.email, password: ACCOUNT.password, ...config }),
  );
  await runtime.refresh({ discover: true });
  return { gladys, cloud, runtime, context: { gladys, runtime } };
}
