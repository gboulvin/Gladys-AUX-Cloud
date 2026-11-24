// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen (`actions` field).
// The resolved multi-language message is displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MESSAGES, messageForError } from './runtime.js';
import { hasCredentials } from './config.js';

const logger = createLogger({ name: 'actions' });

export const ACTIONS = {
  /**
   * Log in and list the account, then say how many units were found.
   */
  async test_connection({ runtime }) {
    logger.info('Action test_connection');
    if (!hasCredentials(runtime.config ?? {})) {
      return MESSAGES.MISSING_CREDENTIALS;
    }
    await runtime.refresh({ discover: true });
    if (!runtime.connected) {
      return messageForError(runtime.lastError);
    }
    const devices = runtime.supportedDevices();
    const online = devices.filter((device) => device.online).length;
    return {
      en: `Connected to AUX Cloud: ${devices.length} unit(s) found, ${online} online.`,
      fr: `Connecté à AUX Cloud : ${devices.length} appareil(s) trouvé(s), ${online} en ligne.`,
      de: `Mit AUX Cloud verbunden: ${devices.length} Gerät(e) gefunden, ${online} online.`,
      es: `Conectado a AUX Cloud: ${devices.length} equipo(s) encontrado(s), ${online} en línea.`,
    };
  },
};
