// -----------------------------------------------------------------------------
// Gladys features of the AUX devices, and their conversion both ways.
//
// Each feature definition maps ONE Gladys feature to the AUX cloud parameter
// behind it:
//   - key        : feature key, part of the feature external_id — FOREVER;
//   - param      : the AUX parameter read to fill the state;
//   - toGladys   : AUX params -> Gladys state (undefined when unknown);
//   - toAux      : Gladys value -> AUX params to write (controllable only);
//   - optional   : published only when the unit reports the parameter (not
//                  every AUX unit has a health ioniser or a child lock).
// Every feature carries name, min, max, read_only and has_feedback: Gladys
// stores them NOT NULL (see CLAUDE.md).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import {
  AC,
  AUX_AC_MODES,
  AUX_FAN_SPEEDS,
  DEVICE_KINDS,
  HP,
  encodeAcTemperature,
  getProfile,
  isV3HeatPump,
} from '../aux/profiles.js';

// Gladys core enums (server/utils/constants.js), not exported by the SDK.
export const GLADYS_AC_MODES = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
export const GLADYS_AC_FAN_SPEEDS = {
  AUTO: 0,
  LOW: 1,
  LOW_MID: 2,
  MID: 3,
  MID_HIGH: 4,
  HIGH: 5,
  QUIET: 6,
  TURBO: 7,
};

// AUX ac_mode <-> Gladys AC_MODE.
const MODE_AUX_TO_GLADYS = new Map([
  [AUX_AC_MODES.COOLING, GLADYS_AC_MODES.COOLING],
  [AUX_AC_MODES.HEATING, GLADYS_AC_MODES.HEATING],
  [AUX_AC_MODES.DRY, GLADYS_AC_MODES.DRYING],
  [AUX_AC_MODES.FAN, GLADYS_AC_MODES.FAN],
  [AUX_AC_MODES.AUTO, GLADYS_AC_MODES.AUTO],
]);
const MODE_GLADYS_TO_AUX = new Map([...MODE_AUX_TO_GLADYS].map(([aux, gladys]) => [gladys, aux]));

// AUX ac_mark <-> Gladys AC_FAN_SPEED.
const FAN_AUX_TO_GLADYS = new Map([
  [AUX_FAN_SPEEDS.AUTO, GLADYS_AC_FAN_SPEEDS.AUTO],
  [AUX_FAN_SPEEDS.LOW, GLADYS_AC_FAN_SPEEDS.LOW],
  [AUX_FAN_SPEEDS.MEDIUM_LOW, GLADYS_AC_FAN_SPEEDS.LOW_MID],
  [AUX_FAN_SPEEDS.MEDIUM, GLADYS_AC_FAN_SPEEDS.MID],
  [AUX_FAN_SPEEDS.MEDIUM_HIGH, GLADYS_AC_FAN_SPEEDS.MID_HIGH],
  [AUX_FAN_SPEEDS.HIGH, GLADYS_AC_FAN_SPEEDS.HIGH],
  [AUX_FAN_SPEEDS.MUTE, GLADYS_AC_FAN_SPEEDS.QUIET],
  [AUX_FAN_SPEEDS.TURBO, GLADYS_AC_FAN_SPEEDS.TURBO],
]);
const FAN_GLADYS_TO_AUX = new Map([...FAN_AUX_TO_GLADYS].map(([aux, gladys]) => [gladys, aux]));

export const AC_TEMPERATURE_RANGE = { min: 16, max: 32 };
export const HP_HEATING_TEMPERATURE_RANGE = { min: 0, max: 64 };
export const HP_WATER_TEMPERATURE_RANGE = { min: 0, max: 75 };

export const FEATURE_KEYS = {
  POWER: 'power',
  MODE: 'mode',
  TARGET_TEMPERATURE: 'target-temperature',
  FAN_SPEED: 'fan-speed',
  SWING_VERTICAL: 'swing-vertical',
  SWING_HORIZONTAL: 'swing-horizontal',
  AMBIENT_TEMPERATURE: 'ambient-temperature',
  ECO: 'eco',
  SLEEP: 'sleep',
  DISPLAY: 'display',
  HEALTH: 'health',
  AUXILIARY_HEAT: 'auxiliary-heat',
  SELF_CLEAN: 'self-clean',
  CHILD_LOCK: 'child-lock',
  MILDEW_PROOF: 'mildew-proof',
  COMFORTABLE_WIND: 'comfortable-wind',
  // Heat pump
  HEATING_POWER: 'heating-power',
  HEATING_TARGET_TEMPERATURE: 'heating-target-temperature',
  WATER_POWER: 'water-power',
  WATER_TARGET_TEMPERATURE: 'water-target-temperature',
  WATER_TANK_TEMPERATURE: 'water-tank-temperature',
  FAST_HOT_WATER: 'fast-hot-water',
  QUIET: 'quiet',
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const binary = (value) => (isNumber(value) ? (value ? 1 : 0) : undefined);
const tenths = (value) => (isNumber(value) ? Math.round(value) / 10 : undefined);
const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

function binaryFeature(key, name, param, { category = CATEGORIES.SWITCH, type, optional } = {}) {
  return {
    key,
    name,
    param,
    optional,
    category,
    type: type ?? TYPES.SWITCH.BINARY,
    min: 0,
    max: 1,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => binary(params[param]),
    toAux: (value) => ({ [param]: value ? 1 : 0 }),
  };
}

const AIR_CONDITIONER_FEATURES = [
  binaryFeature(FEATURE_KEYS.POWER, 'Power', AC.POWER, {
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.BINARY,
  }),
  {
    key: FEATURE_KEYS.MODE,
    name: 'Mode',
    param: AC.MODE,
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.MODE,
    min: 0,
    max: 4,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => MODE_AUX_TO_GLADYS.get(params[AC.MODE]),
    toAux: (value) => {
      const mode = MODE_GLADYS_TO_AUX.get(Math.round(value));
      if (mode === undefined) {
        throw new Error(`Unknown air conditioning mode ${value}`);
      }
      return { [AC.MODE]: mode };
    },
  },
  {
    key: FEATURE_KEYS.TARGET_TEMPERATURE,
    name: 'Target temperature',
    param: AC.TARGET_TEMPERATURE,
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    ...AC_TEMPERATURE_RANGE,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => tenths(params[AC.TARGET_TEMPERATURE]),
    toAux: (value, device) =>
      encodeAcTemperature(device, clamp(Math.round(value * 2) / 2, AC_TEMPERATURE_RANGE)),
  },
  {
    key: FEATURE_KEYS.FAN_SPEED,
    name: 'Fan speed',
    param: AC.FAN_SPEED,
    category: CATEGORIES.AIR_CONDITIONING,
    type: TYPES.AIR_CONDITIONING.FAN_SPEED,
    min: 0,
    max: 7,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => FAN_AUX_TO_GLADYS.get(params[AC.FAN_SPEED]),
    toAux: (value, device) => {
      const wanted = Math.round(value);
      const { fanSpeeds } = getProfile(device.productId);
      let speed = FAN_GLADYS_TO_AUX.get(wanted);
      // A unit without the intermediate speeds gets the nearest one it has.
      if (speed !== undefined && !fanSpeeds.includes(speed)) {
        const nearest = [...FAN_AUX_TO_GLADYS]
          .filter(([aux]) => fanSpeeds.includes(aux))
          .sort(([, a], [, b]) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
        speed = nearest?.[0];
      }
      if (speed === undefined) {
        throw new Error(`Unknown fan speed ${value}`);
      }
      return { [AC.FAN_SPEED]: speed };
    },
  },
  {
    ...binaryFeature(FEATURE_KEYS.SWING_VERTICAL, 'Vertical swing', AC.SWING_VERTICAL, {
      category: CATEGORIES.AIR_CONDITIONING,
      type: TYPES.AIR_CONDITIONING.SWING_VERTICAL,
    }),
    supported: (profile) => profile.verticalSwing,
  },
  {
    ...binaryFeature(FEATURE_KEYS.SWING_HORIZONTAL, 'Horizontal swing', AC.SWING_HORIZONTAL, {
      category: CATEGORIES.AIR_CONDITIONING,
      type: TYPES.AIR_CONDITIONING.SWING_HORIZONTAL,
    }),
    supported: (profile) => profile.horizontalSwing,
  },
  {
    key: FEATURE_KEYS.AMBIENT_TEMPERATURE,
    name: 'Room temperature',
    param: AC.AMBIENT_TEMPERATURE,
    category: CATEGORIES.TEMPERATURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.CELSIUS,
    min: -30,
    max: 70,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    toGladys: (params) => tenths(params[AC.AMBIENT_TEMPERATURE]),
  },
  binaryFeature(FEATURE_KEYS.ECO, 'Eco mode', AC.ECO, { optional: true }),
  binaryFeature(FEATURE_KEYS.SLEEP, 'Sleep mode', AC.SLEEP, { optional: true }),
  binaryFeature(FEATURE_KEYS.DISPLAY, 'Display', AC.SCREEN_DISPLAY, { optional: true }),
  binaryFeature(FEATURE_KEYS.HEALTH, 'Health (ioniser)', AC.HEALTH, { optional: true }),
  binaryFeature(FEATURE_KEYS.AUXILIARY_HEAT, 'Auxiliary heat', AC.AUXILIARY_HEAT, {
    optional: true,
  }),
  binaryFeature(FEATURE_KEYS.SELF_CLEAN, 'Self clean', AC.CLEAN, { optional: true }),
  binaryFeature(FEATURE_KEYS.CHILD_LOCK, 'Child lock', AC.CHILD_LOCK, { optional: true }),
  binaryFeature(FEATURE_KEYS.MILDEW_PROOF, 'Mildew proof', AC.MILDEW_PROOF, { optional: true }),
  binaryFeature(FEATURE_KEYS.COMFORTABLE_WIND, 'Comfortable wind', AC.COMFORTABLE_WIND, {
    optional: true,
  }),
];

const HEAT_PUMP_FEATURES = [
  binaryFeature(FEATURE_KEYS.HEATING_POWER, 'Heating', HP.HEATING_POWER),
  {
    key: FEATURE_KEYS.HEATING_TARGET_TEMPERATURE,
    name: 'Heating target temperature',
    param: HP.HEATING_TARGET_TEMPERATURE,
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    ...HP_HEATING_TEMPERATURE_RANGE,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => tenths(params[HP.HEATING_TARGET_TEMPERATURE]),
    toAux: (value) => ({
      [HP.HEATING_TARGET_TEMPERATURE]: Math.round(clamp(value, HP_HEATING_TEMPERATURE_RANGE)) * 10,
    }),
  },
  binaryFeature(FEATURE_KEYS.WATER_POWER, 'Hot water', HP.WATER_POWER, {
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.BINARY,
  }),
  {
    key: FEATURE_KEYS.WATER_TARGET_TEMPERATURE,
    name: 'Hot water target temperature',
    param: HP.WATER_TARGET_TEMPERATURE,
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    ...HP_WATER_TEMPERATURE_RANGE,
    read_only: false,
    has_feedback: true,
    keep_history: true,
    toGladys: (params) => tenths(params[HP.WATER_TARGET_TEMPERATURE]),
    toAux: (value) => ({
      [HP.WATER_TARGET_TEMPERATURE]: Math.round(clamp(value, HP_WATER_TEMPERATURE_RANGE)) * 10,
    }),
  },
  {
    key: FEATURE_KEYS.WATER_TANK_TEMPERATURE,
    name: 'Water tank temperature',
    param: HP.WATER_TANK_TEMPERATURE,
    category: CATEGORIES.TEMPERATURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.CELSIUS,
    min: -20,
    max: 120,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    // Older heat pumps report whole degrees, v3 ones tenths.
    toGladys: (params, device) => {
      const value = params[HP.WATER_TANK_TEMPERATURE];
      if (!isNumber(value)) {
        return undefined;
      }
      return isV3HeatPump(device) ? value / 10 : value;
    },
  },
  binaryFeature(FEATURE_KEYS.FAST_HOT_WATER, 'Fast hot water', HP.FAST_HOT_WATER, {
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.BOOST,
    optional: true,
  }),
  binaryFeature(FEATURE_KEYS.QUIET, 'Quiet mode', HP.QUIET_MODE, { optional: true }),
  binaryFeature(FEATURE_KEYS.ECO, 'Eco mode', HP.ECO, { optional: true }),
];

export const FEATURES_BY_KIND = {
  [DEVICE_KINDS.AIR_CONDITIONER]: AIR_CONDITIONER_FEATURES,
  [DEVICE_KINDS.HEAT_PUMP]: HEAT_PUMP_FEATURES,
};

/**
 * The features one AUX device exposes: every mandatory feature its profile
 * supports, plus the optional ones the unit reports. A controllable feature
 * whose parameter the profile cannot write is published read-only.
 */
export function featuresOf(device) {
  const profile = getProfile(device.productId);
  const params = device.params ?? {};
  return FEATURES_BY_KIND[profile.kind]
    .filter((feature) => !feature.supported || feature.supported(profile))
    .filter((feature) => !feature.optional || feature.param in params)
    .map((feature) =>
      feature.toAux && !profile.writable.includes(feature.param)
        ? { ...feature, read_only: true, toAux: undefined }
        : feature,
    );
}
