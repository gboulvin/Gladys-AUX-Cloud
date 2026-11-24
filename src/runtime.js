// -----------------------------------------------------------------------------
// Runtime of the integration: the AUX cloud client, the device inventory and
// the refresh loop.
//
// One loop refreshes the whole account at the interval of the configuration
// (one batched online-state query, then the parameters of the online units),
// instead of one Gladys poll per device: fewer cloud calls, and every device
// is read at the same pace. The account is re-listed every hour to pick up
// the units added in the AC Freedom app.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { AuxCloudClient } from './aux/client.js';
import { ERROR_KINDS } from './aux/errors.js';
import { normalizeParams } from './aux/profiles.js';
import { hasCredentials } from './config.js';
import {
  buildDiscoveredDevices,
  commandFor,
  externalIdsOf,
  findDevice,
  isSupported,
  resolveFeature,
  statesOf,
} from './devices/index.js';
import { eventsBetween, snapshotOf } from './triggers.js';

const logger = createLogger({ name: 'runtime' });

// An unchanged state is re-sent every 30 minutes, so it stays recently dated.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;
const REDISCOVERY_INTERVAL_MS = 60 * 60 * 1000;

export const MESSAGES = {
  MISSING_CREDENTIALS: {
    en: 'Enter the e-mail (or phone number) and password of your AC Freedom account.',
    fr: 'Saisissez l’e-mail (ou le numéro de téléphone) et le mot de passe de votre compte AC Freedom.',
    de: 'Geben Sie die E-Mail-Adresse (oder Telefonnummer) und das Passwort Ihres AC-Freedom-Kontos ein.',
    es: 'Introduzca el correo electrónico (o teléfono) y la contraseña de su cuenta AC Freedom.',
  },
  BAD_CREDENTIALS: {
    en: 'AUX Cloud refused the login: check the account and the region.',
    fr: 'AUX Cloud a refusé la connexion : vérifiez le compte et la région.',
    de: 'AUX Cloud hat die Anmeldung abgelehnt: Konto und Region prüfen.',
    es: 'AUX Cloud rechazó el inicio de sesión: compruebe la cuenta y la región.',
  },
  RATE_LIMITED: {
    en: 'AUX Cloud is limiting requests: increase the refresh interval.',
    fr: 'AUX Cloud limite les requêtes : augmentez l’intervalle de rafraîchissement.',
    de: 'AUX Cloud begrenzt die Anfragen: Aktualisierungsintervall erhöhen.',
    es: 'AUX Cloud limita las solicitudes: aumente el intervalo de actualización.',
  },
  UNREACHABLE: {
    en: 'AUX Cloud cannot be reached, retrying at the next refresh.',
    fr: 'AUX Cloud est injoignable, nouvel essai au prochain rafraîchissement.',
    de: 'AUX Cloud ist nicht erreichbar, neuer Versuch bei der nächsten Aktualisierung.',
    es: 'No se puede contactar con AUX Cloud, se reintentará en la próxima actualización.',
  },
};

export function messageForError(err) {
  switch (err?.kind) {
    case ERROR_KINDS.AUTH:
      return MESSAGES.BAD_CREDENTIALS;
    case ERROR_KINDS.RATE_LIMIT:
      return MESSAGES.RATE_LIMITED;
    default:
      return MESSAGES.UNREACHABLE;
  }
}

export class AuxRuntime {
  /**
   * @param {object} gladys the SDK client
   * @param {{ createClient?: (config) => AuxCloudClient }} [options]
   */
  constructor(gladys, { createClient } = {}) {
    this.gladys = gladys;
    this.createClient = createClient ?? ((config) => new AuxCloudClient({ region: config.region }));
    this.client = undefined;
    this.clientKey = undefined;
    this.config = undefined;
    this.devices = [];
    this.snapshots = new Map();
    this.timer = undefined;
    this.lastDiscovery = 0;
    this.refreshing = undefined;
    this.connected = false;
    this.lastError = undefined;
    this.lastRefresh = undefined;
    this.onChange = () => {};
  }

  /**
   * Apply a (new) configuration. A changed account or region starts a fresh
   * client and inventory.
   */
  configure(config) {
    this.config = config;
    const key = JSON.stringify([config.username, config.password, config.region]);
    if (key !== this.clientKey) {
      this.clientKey = key;
      this.client = this.createClient(config);
      this.client.setCredentials(config.username, config.password);
      this.devices = [];
      this.snapshots.clear();
      this.lastDiscovery = 0;
    }
  }

  /**
   * (Re)start: discover the account, publish everything, start the loop.
   */
  async start() {
    this.stop();
    await this.refresh({ discover: true });
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (err) {
        logger.error('Refresh failed', err);
      }
      this.schedule();
    }, this.config.poll_frequency * 1000);
    this.timer.unref?.();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  supportedDevices() {
    return this.devices.filter(isSupported);
  }

  /**
   * One refresh of the account. Concurrent calls share the running one.
   */
  refresh(options = {}) {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh(options).finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async doRefresh({ discover = false } = {}) {
    if (!hasCredentials(this.config)) {
      await this.setConnection(false, MESSAGES.MISSING_CREDENTIALS);
      return;
    }
    try {
      const rediscover =
        discover ||
        this.devices.length === 0 ||
        Date.now() - this.lastDiscovery >= REDISCOVERY_INTERVAL_MS;
      if (rediscover) {
        this.devices = await this.client.listDevices();
        this.lastDiscovery = Date.now();
        const discovered = buildDiscoveredDevices(this.gladys, this.devices);
        logger.info(`${discovered.length} AUX device(s) found`);
        await this.gladys.publishDiscoveredDevices(discovered);
      } else {
        await this.client.refreshDevices(this.devices);
      }
      this.lastRefresh = new Date();
      await this.publishAll();
      await this.setConnection(true);
    } catch (err) {
      logger.error(`AUX Cloud refresh failed (${err.message})`);
      this.lastError = err;
      await this.setConnection(false, messageForError(err));
    }
  }

  async setConnection(connected, message) {
    const changed = connected !== this.connected || message !== this.lastMessage;
    this.connected = connected;
    this.lastMessage = message;
    if (connected) {
      this.lastError = undefined;
    }
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
    if (changed) {
      this.onChange();
    }
  }

  /**
   * Publish the states, the transport badges and the scene events of every
   * device, from the current inventory.
   */
  async publishAll() {
    const devices = this.supportedDevices();
    const states = devices.flatMap((device) => statesOf(this.gladys, device));
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
    if (devices.length > 0) {
      await this.gladys.publishTransports(
        devices.map((device) => ({
          external_id: externalIdsOf(this.gladys, device).device,
          transport: device.online ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
        })),
      );
    }
    let changed = false;
    for (const device of devices) {
      const externalId = externalIdsOf(this.gladys, device).device;
      const snapshot = snapshotOf(device);
      const previous = this.snapshots.get(externalId);
      this.snapshots.set(externalId, snapshot);
      if (JSON.stringify(previous) !== JSON.stringify(snapshot)) {
        changed = true;
      }
      for (const event of eventsBetween(externalId, previous, snapshot)) {
        await this.gladys
          .publishSceneEvent(event.key, event.data)
          .catch((err) => logger.error(`Scene event ${event.key} refused`, err));
      }
    }
    if (changed) {
      this.onChange();
    }
  }

  findDevice(deviceExternalId) {
    return findDevice(this.gladys, this.devices, deviceExternalId);
  }

  /**
   * Write AUX parameters to one device, then reflect them in Gladys.
   */
  async writeParams(device, values) {
    if (!this.client) {
      throw new Error('The integration is not configured');
    }
    if (!device.online) {
      throw new Error(`${device.friendlyName ?? device.endpointId} is offline`);
    }
    const echoed = await this.client.setParams(device, values);
    device.params = { ...device.params, ...values, ...echoed };
    normalizeParams(device);
    await this.publishAll();
  }

  /**
   * Handler of a Gladys command on one feature.
   */
  async setValue(featureExternalId, value) {
    const resolved = resolveFeature(this.gladys, this.devices, featureExternalId);
    if (!resolved?.feature) {
      throw new Error(`Unknown AUX feature ${featureExternalId}`);
    }
    const values = commandFor(resolved.device, resolved.feature.key, value);
    logger.info(`Command ${resolved.feature.key} = ${value}`);
    await this.writeParams(resolved.device, values);
  }
}
