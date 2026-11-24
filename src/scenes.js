// -----------------------------------------------------------------------------
// Scene actions (SDK v0.14+, Gladys 5.1+).
//
// Operations a scene author places in a scene, declared in the manifest
// `scene_actions` field and handled here under the same `key`:
//   - `fields` arrive RESOLVED (variables substituted, defaults applied); a
//     `"source": "devices"` field is the chosen device external_id;
//   - the handler resolves the declared `outputs` (scalars only);
//   - throwing fails THIS action only: the scene logs it and continues.
// Several parameters of one unit are written in ONE cloud command.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AC, DEVICE_KINDS, HP, getProfile } from './aux/profiles.js';
import { commandFor, kindOf } from './devices/index.js';
import { FEATURE_KEYS, GLADYS_AC_FAN_SPEEDS, GLADYS_AC_MODES } from './devices/features.js';

const logger = createLogger({ name: 'scenes' });

// Option values of the manifest selects -> Gladys enum values.
export const MODE_OPTIONS = {
  auto: GLADYS_AC_MODES.AUTO,
  cool: GLADYS_AC_MODES.COOLING,
  heat: GLADYS_AC_MODES.HEATING,
  dry: GLADYS_AC_MODES.DRYING,
  fan: GLADYS_AC_MODES.FAN,
};
export const FAN_SPEED_OPTIONS = {
  auto: GLADYS_AC_FAN_SPEEDS.AUTO,
  low: GLADYS_AC_FAN_SPEEDS.LOW,
  medium: GLADYS_AC_FAN_SPEEDS.MID,
  high: GLADYS_AC_FAN_SPEEDS.HIGH,
  quiet: GLADYS_AC_FAN_SPEEDS.QUIET,
  turbo: GLADYS_AC_FAN_SPEEDS.TURBO,
};
// "keep" (or an empty field) leaves the parameter unchanged.
const KEEP = 'keep';

const isSet = (value) => value !== undefined && value !== null && value !== '' && value !== KEEP;

function requireDevice(runtime, externalId, kind) {
  const device = runtime.findDevice(externalId);
  if (!device) {
    throw new Error(`Unknown AUX device ${externalId}`);
  }
  if (kind && kindOf(device) !== kind) {
    throw new Error(`${device.friendlyName ?? externalId} is not a ${kind} unit`);
  }
  return device;
}

export const SCENE_ACTIONS = {
  /**
   * Set power, mode, target temperature and fan speed of an air conditioner
   * in one command.
   */
  async set_climate({ runtime }, { fields }) {
    logger.info(`Scene action set_climate <- ${fields.device}`);
    const device = requireDevice(runtime, fields.device, DEVICE_KINDS.AIR_CONDITIONER);
    const values = {};
    if (isSet(fields.power)) {
      values[AC.POWER] = fields.power === 'on' ? 1 : 0;
    }
    if (isSet(fields.mode)) {
      if (!(fields.mode in MODE_OPTIONS)) {
        throw new Error(`Unknown mode ${fields.mode}`);
      }
      Object.assign(values, commandFor(device, FEATURE_KEYS.MODE, MODE_OPTIONS[fields.mode]));
    }
    if (isSet(fields.target_temperature)) {
      const temperature = Number(fields.target_temperature);
      if (!Number.isFinite(temperature)) {
        throw new Error(`Invalid temperature ${fields.target_temperature}`);
      }
      Object.assign(values, commandFor(device, FEATURE_KEYS.TARGET_TEMPERATURE, temperature));
    }
    if (isSet(fields.fan_speed)) {
      if (!(fields.fan_speed in FAN_SPEED_OPTIONS)) {
        throw new Error(`Unknown fan speed ${fields.fan_speed}`);
      }
      Object.assign(
        values,
        commandFor(device, FEATURE_KEYS.FAN_SPEED, FAN_SPEED_OPTIONS[fields.fan_speed]),
      );
    }
    if (Object.keys(values).length === 0) {
      return { applied: false };
    }
    await runtime.writeParams(device, values);
    return { applied: true };
  },

  /**
   * Set the hot water production of a heat pump.
   */
  async set_hot_water({ runtime }, { fields }) {
    logger.info(`Scene action set_hot_water <- ${fields.device}`);
    const device = requireDevice(runtime, fields.device, DEVICE_KINDS.HEAT_PUMP);
    const values = {};
    if (isSet(fields.power)) {
      values[HP.WATER_POWER] = fields.power === 'on' ? 1 : 0;
    }
    if (isSet(fields.target_temperature)) {
      Object.assign(
        values,
        commandFor(
          device,
          FEATURE_KEYS.WATER_TARGET_TEMPERATURE,
          Number(fields.target_temperature),
        ),
      );
    }
    if (isSet(fields.boost)) {
      values[HP.FAST_HOT_WATER] = fields.boost === 'on' ? 1 : 0;
    }
    if (Object.keys(values).length === 0) {
      return { applied: false };
    }
    await runtime.writeParams(device, values);
    return { applied: true };
  },

  /**
   * Turn every online AUX unit off (air conditioners and heat pump heating).
   * Resolves how many units were turned off.
   */
  async turn_off_all({ runtime }) {
    logger.info('Scene action turn_off_all');
    return { turned_off: await turnOffAll(runtime) };
  },
};

/**
 * Turn off every online unit that is on. Shared by the scene action and the
 * dashboard widget button.
 */
export async function turnOffAll(runtime) {
  let count = 0;
  const failures = [];
  for (const device of runtime.supportedDevices()) {
    const param =
      getProfile(device.productId).kind === DEVICE_KINDS.HEAT_PUMP ? HP.HEATING_POWER : AC.POWER;
    if (!device.online || device.params?.[param] !== 1) {
      continue;
    }
    try {
      await runtime.writeParams(device, { [param]: 0 });
      count += 1;
    } catch (err) {
      failures.push(err);
    }
  }
  if (count === 0 && failures.length > 0) {
    throw failures[0];
  }
  return count;
}
