// -----------------------------------------------------------------------------
// AUX product profiles: what each product family supports, and how its
// parameters are encoded on the wire.
//
// Ported from ha-aux-cloud (custom_components/aux_cloud/devices.py). The cloud
// identifies the hardware by its `productId`; an unknown product is exposed
// as a standard air conditioner when it reports AC parameters, since most AUX
// split units share the same parameter set.
// -----------------------------------------------------------------------------

export const DEVICE_KINDS = {
  AIR_CONDITIONER: 'ac',
  HEAT_PUMP: 'heat_pump',
};

// --- AC parameters (cloud names) --------------------------------------------
export const AC = {
  POWER: 'pwr',
  MODE: 'ac_mode',
  TARGET_TEMPERATURE: 'temp',
  AMBIENT_TEMPERATURE: 'envtemp',
  TEMPERATURE_UNIT: 'tempunit',
  TEMPERATURE_DECIMAL: 'ac_tempdec',
  TEMPERATURE_CONVERSION: 'ac_tempconvert',
  FAN_SPEED: 'ac_mark',
  SWING_VERTICAL: 'ac_vdir',
  SWING_HORIZONTAL: 'ac_hdir',
  ECO: 'ecomode',
  SLEEP: 'ac_slp',
  AUXILIARY_HEAT: 'ac_astheat',
  CLEAN: 'ac_clean',
  HEALTH: 'ac_health',
  CHILD_LOCK: 'childlock',
  COMFORTABLE_WIND: 'comfwind',
  MILDEW_PROOF: 'mldprf',
  SCREEN_DISPLAY: 'scrdisp',
  ERROR_FLAG: 'err_flag',
  ERROR_CODE: 'ac_errcode1',
  // Querying this "special" parameter makes the unit report its ambient
  // temperature, which the plain query omits on some firmwares.
  SPECIAL_MODE: 'mode',
};

// AUX wire values of `ac_mode`.
export const AUX_AC_MODES = { COOLING: 0, HEATING: 1, DRY: 2, FAN: 3, AUTO: 4 };

// AUX wire values of `ac_mark`.
export const AUX_FAN_SPEEDS = {
  AUTO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  TURBO: 4,
  MUTE: 5,
  MEDIUM_LOW: 6,
  MEDIUM_HIGH: 7,
};

// --- Heat pump parameters ---------------------------------------------------
export const HP = {
  HEATING_POWER: 'ac_pwr',
  HEATING_TARGET_TEMPERATURE: 'ac_temp',
  WATER_POWER: 'hp_pwr',
  WATER_TARGET_TEMPERATURE: 'hp_hotwater_temp',
  WATER_TANK_TEMPERATURE: 'hp_water_tank_temp',
  FAST_HOT_WATER: 'hp_fast_hotwater',
  QUIET_MODE: 'qtmode',
  AUTO_WATER_TEMPERATURE: 'hp_auto_wtemp',
  ECO: 'ecomode',
  MODE: 'ac_mode',
  ERROR_FLAG: 'err_flag',
};

const HEAT_PUMP_PRODUCT_IDS = ['000000000000000000000000c3aa0000'];

const AC_WRITABLE = [
  AC.AUXILIARY_HEAT,
  AC.CHILD_LOCK,
  AC.CLEAN,
  AC.COMFORTABLE_WIND,
  AC.FAN_SPEED,
  AC.HEALTH,
  AC.MILDEW_PROOF,
  AC.POWER,
  AC.SCREEN_DISPLAY,
  AC.SLEEP,
  AC.SWING_HORIZONTAL,
  AC.SWING_VERTICAL,
  AC.TEMPERATURE_CONVERSION,
  AC.TEMPERATURE_DECIMAL,
  AC.TARGET_TEMPERATURE,
  AC.TEMPERATURE_UNIT,
  AC.ECO,
  AC.MODE,
];

const SUBDEVICE_WRITABLE = [
  AC.FAN_SPEED,
  AC.MODE,
  AC.POWER,
  AC.SCREEN_DISPLAY,
  AC.SWING_HORIZONTAL,
  AC.SWING_VERTICAL,
  AC.TARGET_TEMPERATURE,
  AC.TEMPERATURE_UNIT,
  AC.TEMPERATURE_DECIMAL,
  AC.TEMPERATURE_CONVERSION,
];

const HP_WRITABLE = [
  HP.ECO,
  HP.MODE,
  HP.AUTO_WATER_TEMPERATURE,
  HP.HEATING_POWER,
  HP.HEATING_TARGET_TEMPERATURE,
  HP.WATER_TARGET_TEMPERATURE,
  HP.QUIET_MODE,
  HP.FAST_HOT_WATER,
  HP.WATER_POWER,
];

const STANDARD_AC_MODES = [0, 1, 2, 3, 4];
const NO_AUTO_AC_MODES = [0, 1, 2, 3];
const STANDARD_FAN_SPEEDS = [0, 1, 2, 3, 4, 5];
const EXTENDED_FAN_SPEEDS = [0, 1, 6, 2, 7, 3, 4, 5];
const VRV_FAN_SPEEDS = [1, 2, 3];

function acProfile(productIds, overrides = {}) {
  return {
    productIds,
    kind: DEVICE_KINDS.AIR_CONDITIONER,
    modelName: 'AUX Air Conditioner',
    writable: AC_WRITABLE,
    modes: STANDARD_AC_MODES,
    fanSpeeds: STANDARD_FAN_SPEEDS,
    horizontalSwing: true,
    verticalSwing: true,
    halfDegreeViaFlag: false,
    specialQueries: [AC.SPECIAL_MODE],
    ...overrides,
  };
}

export const PROFILES = [
  acProfile([
    '000000000000000000000000c0620000',
    '0000000000000000000000002a4e0000',
    '0000000000000000000000007faf0000',
    '00000000000000000000000082af0000',
  ]),
  acProfile(['0000000000000000000000001f620000'], { halfDegreeViaFlag: true }),
  acProfile(['00000000000000000000000028620000', '000000000000000000000000c5510000'], {
    modes: NO_AUTO_AC_MODES,
    fanSpeeds: EXTENDED_FAN_SPEEDS,
  }),
  acProfile(['00000000000000000000000056ac0000', '000000000000000000000000a44e0000'], {
    modelName: 'AUX VRV Air Conditioner',
    fanSpeeds: VRV_FAN_SPEEDS,
    horizontalSwing: false,
  }),
  acProfile(['00000000000000000000000045620000'], {
    modelName: 'AUX Multi-split Air Conditioner',
    modes: NO_AUTO_AC_MODES,
    fanSpeeds: EXTENDED_FAN_SPEEDS,
    halfDegreeViaFlag: true,
  }),
  acProfile(['000000000000000000000000c9100100'], {
    modelName: 'AUX Air Conditioner Sub-device',
    writable: SUBDEVICE_WRITABLE,
    modes: NO_AUTO_AC_MODES,
    fanSpeeds: EXTENDED_FAN_SPEEDS,
    halfDegreeViaFlag: true,
  }),
  {
    productIds: HEAT_PUMP_PRODUCT_IDS,
    kind: DEVICE_KINDS.HEAT_PUMP,
    modelName: 'AUX Heat Pump',
    writable: HP_WRITABLE,
    specialQueries: [HP.WATER_TANK_TEMPERATURE],
  },
];

// Unknown products: treated as a standard AC (the most common AUX hardware).
export const FALLBACK_AC_PROFILE = acProfile([], { modelName: 'AUX Air Conditioner' });

/**
 * Profile of a product, or the fallback AC profile for an unknown product.
 * @param {string | undefined} productId
 */
export function getProfile(productId) {
  return PROFILES.find((profile) => profile.productIds.includes(productId)) ?? FALLBACK_AC_PROFILE;
}

/**
 * Protocol version of a device (heat pumps v3+ need `ver` in every query).
 * Read from the session cache, then from the `extern` metadata, the cookie's
 * `extend` field, and finally the last params.
 */
export function getProtocolVersion(device) {
  const candidates = [
    device.protocolVersion,
    parseObject(device.extern)?.ver,
    parseObject(decodeCookie(device.cookie)?.extend)?.ver,
    device.params?.ver,
  ];
  for (const value of candidates) {
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export function isV3HeatPump(device) {
  const version = getProtocolVersion(device);
  return version !== undefined && version >= 3 && HEAT_PUMP_PRODUCT_IDS.includes(device.productId);
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const MAX_COOKIE_BYTES = 512 * 1024;

/**
 * Decode the base64 JSON cookie the cloud attaches to every device. It holds
 * the per-device AES key and terminal id required to build a command.
 */
export function decodeCookie(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const encoded = value.trim();
  if (encoded.length > (MAX_COOKIE_BYTES * 4) / 3 + 4) {
    return undefined;
  }
  try {
    return parseObject(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

// --- Temperature encodings --------------------------------------------------

/**
 * Normalize the raw params of a device in place: decode the product-specific
 * encodings of the target temperature (half-degree flag, Fahrenheit
 * conversion) and the v3 heat-pump tank temperature.
 */
export function normalizeParams(device) {
  const params = device.params ?? {};
  const profile = getProfile(device.productId);
  if (profile.kind === DEVICE_KINDS.AIR_CONDITIONER) {
    const target = params[AC.TARGET_TEMPERATURE];
    if (typeof target === 'number') {
      const base = Math.floor(target / 10) * 10;
      const conversion = params[AC.TEMPERATURE_CONVERSION];
      if (
        params[AC.TEMPERATURE_UNIT] === 2 &&
        typeof conversion === 'number' &&
        conversion >= 0 &&
        conversion <= 9
      ) {
        params[AC.TARGET_TEMPERATURE] = base + Math.trunc(conversion);
      } else if (profile.halfDegreeViaFlag && params[AC.TEMPERATURE_DECIMAL] === 1) {
        params[AC.TARGET_TEMPERATURE] = base + 5;
      }
    }
  }
  if (isV3HeatPump(device) && typeof params.key_states === 'string') {
    const decoded = decodeV3TankTemperature(params.key_states);
    if (decoded !== undefined) {
      params[HP.WATER_TANK_TEMPERATURE] = decoded;
    }
  }
  return params;
}

/**
 * v3 heat pumps report the tank temperature in the third byte of
 * `key_states` (hex), offset by 32 °C. Returned in tenths of a degree.
 */
export function decodeV3TankTemperature(hex) {
  if (typeof hex !== 'string' || hex.length < 6 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return undefined;
  }
  const celsius = parseInt(hex.slice(4, 6), 16) - 32;
  if (celsius < -20 || celsius > 120) {
    return undefined;
  }
  return celsius * 10;
}

/**
 * Encode a Celsius target temperature the way the AC Freedom app does.
 * @returns {Record<string, number>} the params to send
 */
export function encodeAcTemperature(device, celsius) {
  const profile = getProfile(device.productId);
  const params = device.params ?? {};
  if (params[AC.TEMPERATURE_UNIT] === 2) {
    // The app truncates the Celsius conversion of Fahrenheit targets.
    const x10 = Math.trunc(celsius * 10);
    const base = Math.floor(x10 / 10) * 10;
    return {
      [AC.TARGET_TEMPERATURE]: base,
      [AC.TEMPERATURE_UNIT]: 2,
      [AC.TEMPERATURE_DECIMAL]: 0,
      [AC.TEMPERATURE_CONVERSION]: x10 - base,
    };
  }
  const x10 = Math.round(celsius * 10);
  if (profile.halfDegreeViaFlag) {
    const base = Math.floor(x10 / 10) * 10;
    return { [AC.TARGET_TEMPERATURE]: base, [AC.TEMPERATURE_DECIMAL]: x10 - base >= 5 ? 1 : 0 };
  }
  return { [AC.TARGET_TEMPERATURE]: x10 };
}

/**
 * First parameter (or value) this profile refuses, or undefined.
 */
export function invalidCommandParameter(profile, values) {
  for (const param of Object.keys(values)) {
    if (!profile.writable.includes(param)) {
      return param;
    }
  }
  if (profile.kind === DEVICE_KINDS.AIR_CONDITIONER) {
    if (values[AC.MODE] !== undefined && !profile.modes.includes(values[AC.MODE])) {
      return AC.MODE;
    }
    if (values[AC.FAN_SPEED] !== undefined && !profile.fanSpeeds.includes(values[AC.FAN_SPEED])) {
      return AC.FAN_SPEED;
    }
    if (values[AC.SWING_HORIZONTAL] !== undefined && !profile.horizontalSwing) {
      return AC.SWING_HORIZONTAL;
    }
    if (values[AC.SWING_VERTICAL] !== undefined && !profile.verticalSwing) {
      return AC.SWING_VERTICAL;
    }
  }
  return undefined;
}
