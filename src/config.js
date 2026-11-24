// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers sent as strings.
// -----------------------------------------------------------------------------

import { REGIONS } from './aux/client.js';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  username: '',
  // `secret` field: no default in the manifest, never logged.
  password: '',
  region: 'eu',
  // Seconds between two refreshes of the devices from the cloud.
  poll_frequency: 60,
};

export const POLL_FREQUENCY_RANGE = { min: 30, max: 3600 };

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    region: REGIONS[raw.region] ? raw.region : DEFAULT_CONFIG.region,
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_RANGE.max, Math.max(POLL_FREQUENCY_RANGE.min, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
  };
}

export function hasCredentials(config) {
  return Boolean(config.username && config.password);
}
