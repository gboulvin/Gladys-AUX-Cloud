// -----------------------------------------------------------------------------
// Scene triggers (SDK v0.14+, Gladys 5.1+).
//
// The AUX cloud is polled: an event is the EDGE between two snapshots of a
// device, never a repeated value — the core admits 300 events per minute.
// The first snapshot of a device is a baseline and fires nothing (a restart of
// the integration must not replay "turned on" for every running unit).
//
// The keys are declared in the manifest `scene_triggers` field, and `data`
// only carries the keys the trigger declares in `fields` (the filters) and
// `variables` (exposed to the scene). Keys are FOREVER: scenes store them.
// -----------------------------------------------------------------------------

import { AC, DEVICE_KINDS, HP, getProfile } from './aux/profiles.js';

export const SCENE_TRIGGERS = {
  POWER_CHANGED: 'power_changed',
  ERROR_DETECTED: 'error_detected',
  AVAILABILITY_CHANGED: 'availability_changed',
};

function powerParam(device) {
  return getProfile(device.productId).kind === DEVICE_KINDS.HEAT_PUMP ? HP.HEATING_POWER : AC.POWER;
}

/**
 * The part of a device the triggers watch.
 */
export function snapshotOf(device) {
  const params = device.params ?? {};
  const power = params[powerParam(device)];
  const errorFlag = params[AC.ERROR_FLAG];
  const errorCode = params[AC.ERROR_CODE];
  return {
    online: Boolean(device.online),
    power: typeof power === 'number' ? (power ? 1 : 0) : undefined,
    error: typeof errorFlag === 'number' ? (errorFlag ? 1 : 0) : undefined,
    errorCode: typeof errorCode === 'number' ? errorCode : 0,
  };
}

/**
 * Scene events between two snapshots of one device.
 * @param {string} deviceExternalId value of the `"source": "devices"` filters
 * @returns {Array<{ key: string, data: object }>}
 */
export function eventsBetween(deviceExternalId, previous, current) {
  if (!previous) {
    return [];
  }
  const events = [];
  if (previous.online !== current.online) {
    events.push({
      key: SCENE_TRIGGERS.AVAILABILITY_CHANGED,
      data: { device: deviceExternalId, status: current.online ? 'online' : 'offline' },
    });
  }
  // An offline unit reports nothing: no power or error edge until it is back.
  if (!current.online) {
    return events;
  }
  if (
    previous.power !== undefined &&
    current.power !== undefined &&
    previous.power !== current.power
  ) {
    events.push({
      key: SCENE_TRIGGERS.POWER_CHANGED,
      data: { device: deviceExternalId, state: current.power ? 'on' : 'off' },
    });
  }
  if (previous.error === 0 && current.error === 1) {
    events.push({
      key: SCENE_TRIGGERS.ERROR_DETECTED,
      data: { device: deviceExternalId, error_code: current.errorCode },
    });
  }
  return events;
}
