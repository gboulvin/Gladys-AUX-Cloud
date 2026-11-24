// -----------------------------------------------------------------------------
// From AUX cloud devices to Gladys devices, and back.
//
// Pure functions: the discovery payload of a device, the states to publish
// from its parameters, and the parameters to write for a Gladys command. The
// runtime (src/runtime.js) owns the cloud client and the device inventory.
// -----------------------------------------------------------------------------

import { DEVICE_KINDS, getProfile, AC } from '../aux/profiles.js';
import { featuresOf, FEATURES_BY_KIND } from './features.js';

// External id types: part of every device external_id, FOREVER.
export const DEVICE_TYPES = {
  [DEVICE_KINDS.AIR_CONDITIONER]: 'ac',
  [DEVICE_KINDS.HEAT_PUMP]: 'heat-pump',
};

/**
 * Whether the integration can expose this cloud device. AUX accounts can hold
 * other BroadLink products: a known product is always exposed, an unknown one
 * only when it reports the parameters of an air conditioner.
 */
export function isSupported(device) {
  const profile = getProfile(device.productId);
  if (profile.productIds.length > 0) {
    return true;
  }
  const params = device.params ?? {};
  return AC.POWER in params && AC.TARGET_TEMPERATURE in params;
}

export function kindOf(device) {
  return getProfile(device.productId).kind;
}

export function externalIdsOf(gladys, device) {
  return gladys.externalIds(DEVICE_TYPES[kindOf(device)], device.endpointId);
}

export function deviceName(device) {
  const name = typeof device.friendlyName === 'string' ? device.friendlyName.trim() : '';
  return name || getProfile(device.productId).modelName;
}

/**
 * Discovery payload of one AUX device.
 */
export function buildDevice(gladys, device) {
  const ids = externalIdsOf(gladys, device);
  return {
    name: deviceName(device),
    external_id: ids.device,
    model: getProfile(device.productId).modelName,
    features: featuresOf(device).map((feature) => {
      const payload = {
        name: feature.name,
        external_id: ids.feature(feature.key),
        category: feature.category,
        type: feature.type,
        min: feature.min,
        max: feature.max,
        read_only: feature.read_only,
        has_feedback: feature.has_feedback,
        keep_history: feature.keep_history,
      };
      if (feature.unit) {
        payload.unit = feature.unit;
      }
      return payload;
    }),
  };
}

export function buildDiscoveredDevices(gladys, devices) {
  return devices.filter(isSupported).map((device) => buildDevice(gladys, device));
}

/**
 * States to publish for one device, from its current parameters. An offline
 * device publishes nothing: its last known states stay in Gladys.
 */
export function statesOf(gladys, device) {
  if (!device.online) {
    return [];
  }
  const ids = externalIdsOf(gladys, device);
  const params = device.params ?? {};
  return featuresOf(device)
    .map((feature) => ({
      device_feature_external_id: ids.feature(feature.key),
      state: feature.toGladys(params, device),
    }))
    .filter((state) => typeof state.state === 'number' && Number.isFinite(state.state));
}

/**
 * Find the AUX device and the feature definition behind a feature external_id.
 */
export function resolveFeature(gladys, devices, featureExternalId) {
  for (const device of devices) {
    if (!isSupported(device)) {
      continue;
    }
    const ids = externalIdsOf(gladys, device);
    if (!featureExternalId.startsWith(`${ids.device}:`)) {
      continue;
    }
    const key = featureExternalId.slice(ids.device.length + 1);
    const feature = FEATURES_BY_KIND[kindOf(device)].find((f) => f.key === key);
    return { device, feature };
  }
  return undefined;
}

/**
 * Find the AUX device behind a device external_id.
 */
export function findDevice(gladys, devices, deviceExternalId) {
  return devices.find(
    (device) => isSupported(device) && externalIdsOf(gladys, device).device === deviceExternalId,
  );
}

/**
 * AUX parameters to write for a Gladys command on one feature.
 */
export function commandFor(device, featureKey, value) {
  const feature = featuresOf(device).find((f) => f.key === featureKey);
  if (!feature) {
    throw new Error(`Unknown feature ${featureKey}`);
  }
  if (typeof feature.toAux !== 'function') {
    throw new Error(`The feature ${featureKey} cannot be controlled on this unit`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid value ${value}`);
  }
  return feature.toAux(number, device);
}
