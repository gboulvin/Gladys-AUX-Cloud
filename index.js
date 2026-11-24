// -----------------------------------------------------------------------------
// Entry point of the AUX Cloud (AC Freedom) integration for Gladys Assistant.
//
// This file only wires the SDK to the runtime (src/runtime.js): handlers are
// registered BEFORE connect(), then the runtime logs in to the AUX cloud,
// publishes the devices and refreshes them at the configured interval.
//
// Environment variables provided by the Gladys supervisor to the container
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR)
// are read by the SDK itself.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { AuxRuntime } from './src/runtime.js';
import { buildDiscoveredDevices } from './src/devices/index.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();
const runtime = new AuxRuntime(gladys);
runtime.onChange = () => refreshWidgets(gladys);

const context = { gladys, runtime };

// --- Discovery: the user opens the Discovery tab ----------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> listing the AUX account');
  await runtime.refresh({ discover: true });
  // A refresh already running (not a discovery) was shared: publish anyway,
  // publishDiscoveredDevices is an idempotent upsert by external_id.
  const devices = buildDiscoveredDevices(gladys, runtime.devices);
  if (devices.length > 0) {
    await gladys.publishDiscoveredDevices(devices);
  }
});

// --- Command: the user acts on a controllable feature -----------------------
gladys.onSetValue(async (device, feature, value) => {
  await runtime.setValue(feature.external_id, value);
});

// --- Manifest actions: buttons of the Configuration screen ------------------
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler(context, { fields }));
}

// --- Scene actions -----------------------------------------------------------
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(context, { fields }));
}

// --- Dashboard widgets -------------------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(context, request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(context, { actionKey, params, settings }),
    );
  }
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  runtime.configure(normalizeConfig(newConfig));
  await runtime.start();
  refreshWidgets(gladys);
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    runtime.configure(normalizeConfig(await gladys.getConfig()));
    await runtime.start();
    refreshWidgets(gladys);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
        de: 'Initialisierung fehlgeschlagen, prüfen Sie die Logs der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  runtime.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  runtime.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the AUX Cloud integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
