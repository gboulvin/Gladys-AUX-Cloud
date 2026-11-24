// -----------------------------------------------------------------------------
// Typed errors of the AUX Cloud (BroadLink DNA) API.
//
// The cloud answers HTTP 200 with a negative `status` (or `code`, `error`...)
// for most failures: the code tells a wrong password from an expired session,
// a rate limit or a device that does not support a parameter. The code sets
// come from the reverse-engineered AC Freedom app (see ha-aux-cloud).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = {
  AUTH: 'auth',
  SESSION: 'session',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  SERVER: 'server',
  DEVICE: 'device',
  UNKNOWN: 'unknown',
};

const CODES_BY_KIND = [
  [ERROR_KINDS.AUTH, [-1006, -1008, -1020, -1033, -1035, -1037]],
  [ERROR_KINDS.SESSION, [-30129, -1000, -1009, -1012, -3003, -49009, 10011]],
  [ERROR_KINDS.RATE_LIMIT, [-2001, -1036]],
  [ERROR_KINDS.NETWORK, [-3004, -3006, -3114, -4000, -4013, -4037, -4038, -4041, -49001]],
  [ERROR_KINDS.SERVER, [-1099, -3005, -49002]],
  [ERROR_KINDS.DEVICE, [-49025, -3, -7, -3103, -3118, -4012, -4028, -4044, -4045, -4046]],
];

// The device answered "this parameter needs a versioned query" (v3 heat pumps).
export const VERSIONED_QUERY_REQUIRED = -49025;

export class AuxApiError extends Error {
  /**
   * @param {string} message
   * @param {{ kind?: string, code?: number, httpStatus?: number, endpoint?: string }} [details]
   */
  constructor(message, { kind = ERROR_KINDS.UNKNOWN, code, httpStatus, endpoint } = {}) {
    super(message);
    this.name = 'AuxApiError';
    this.kind = kind;
    this.code = code;
    this.httpStatus = httpStatus;
    this.endpoint = endpoint;
  }
}

export function kindForCode(code) {
  for (const [kind, codes] of CODES_BY_KIND) {
    if (codes.includes(code)) {
      return kind;
    }
  }
  return ERROR_KINDS.UNKNOWN;
}

function coerceErrorCode(value) {
  if (value === undefined || value === null || value === 0 || value === '0') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return undefined;
  }
  const code = Number(value);
  return Number.isInteger(code) ? code : undefined;
}

const ERROR_PATHS = [
  ['status'],
  ['code'],
  ['error'],
  ['errorCode'],
  ['errcode'],
  ['payload', 'status'],
  ['payload', 'code'],
  ['payload', 'error'],
  ['event', 'payload', 'status'],
  ['event', 'payload', 'code'],
  ['event', 'payload', 'error'],
];

/**
 * First non-success status or code found in a cloud response, or undefined.
 */
export function extractErrorCode(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  for (const path of ERROR_PATHS) {
    let current = payload;
    let found = true;
    for (const key of path) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        found = false;
        break;
      }
      current = current[key];
    }
    if (found) {
      const code = coerceErrorCode(current);
      if (code !== undefined) {
        return code;
      }
    }
  }
  return undefined;
}

/**
 * Throw a typed AuxApiError when a cloud response carries an error code.
 */
export function raiseForCloudResponse(payload, endpoint) {
  const code = extractErrorCode(payload);
  if (code === undefined) {
    return;
  }
  throw new AuxApiError(`AUX Cloud error ${code}`, { kind: kindForCode(code), code, endpoint });
}

/**
 * Throw a typed AuxApiError for a non-2xx HTTP status.
 */
export function raiseForHttpStatus(status, endpoint) {
  if (status >= 200 && status < 300) {
    return;
  }
  let kind = ERROR_KINDS.SERVER;
  if (status === 401 || status === 403) {
    kind = ERROR_KINDS.SESSION;
  } else if (status === 429) {
    kind = ERROR_KINDS.RATE_LIMIT;
  } else if (status < 500) {
    kind = ERROR_KINDS.UNKNOWN;
  }
  throw new AuxApiError(`AUX Cloud HTTP ${status}`, { kind, httpStatus: status, endpoint });
}
