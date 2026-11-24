// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// Declared in the manifest `widgets` field; the integration returns a
// DECLARATIVE content (`value`, `status`, `text`, `button`...) the core renders
// with its own theme and translations. Two widgets:
//   - `aux_overview`: every unit of the account at a glance, plus "turn
//     everything off" and "refresh now" buttons;
//   - `aux_unit`: one unit (chosen in the widget settings) with live tiles and
//     quick controls.
// Device-bound tiles and buttons (`device_feature`) are live and go through the
// normal Gladys command path (onSetValue); the computed rows are refreshed by
// the nudge the runtime sends when a snapshot changes.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { AC, DEVICE_KINDS, HP, isV3HeatPump } from './aux/profiles.js';
import { deviceName, externalIdsOf, kindOf } from './devices/index.js';
import { AC_TEMPERATURE_RANGE, FEATURE_KEYS, featuresOf } from './devices/features.js';
import { turnOffAll } from './scenes.js';

const logger = createLogger({ name: 'widgets' });

export const OVERVIEW_WIDGET = 'aux_overview';
export const UNIT_WIDGET = 'aux_unit';

const OVERVIEW_ACTIONS = { TURN_OFF_ALL: 'turn_off_all', REFRESH: 'refresh' };

const T = {
  off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
  on: { en: 'On', fr: 'Allumé', de: 'An', es: 'Encendido' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  power: { en: 'Power', fr: 'Marche', de: 'Betrieb', es: 'Encendido' },
  mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  fan: { en: 'Fan', fr: 'Ventilation', de: 'Lüfter', es: 'Ventilador' },
  room: { en: 'Room', fr: 'Pièce', de: 'Raum', es: 'Sala' },
  target: { en: 'Target', fr: 'Consigne', de: 'Soll', es: 'Objetivo' },
  tank: { en: 'Tank', fr: 'Ballon', de: 'Speicher', es: 'Depósito' },
  hotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  heating: { en: 'Heating', fr: 'Chauffage', de: 'Heizung', es: 'Calefacción' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  allOff: { en: 'All off', fr: 'Tout éteindre', de: 'Alle aus', es: 'Apagar todo' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noDevice: {
    en: 'No AUX unit yet: check the integration configuration.',
    fr: 'Aucun appareil AUX pour l’instant : vérifiez la configuration de l’intégration.',
    de: 'Noch kein AUX-Gerät: Konfiguration der Integration prüfen.',
    es: 'Aún no hay ningún equipo AUX: revise la configuración de la integración.',
  },
  chooseDevice: {
    en: 'Choose an AUX unit in the widget settings.',
    fr: 'Choisissez un appareil AUX dans les réglages du widget.',
    de: 'Wählen Sie ein AUX-Gerät in den Widget-Einstellungen.',
    es: 'Elija un equipo AUX en los ajustes del widget.',
  },
  disconnected: {
    en: 'AUX Cloud is disconnected.',
    fr: 'AUX Cloud est déconnecté.',
    de: 'AUX Cloud ist getrennt.',
    es: 'AUX Cloud está desconectado.',
  },
};

const MODE_LABELS = {
  0: { en: 'Cooling', fr: 'Froid', de: 'Kühlen', es: 'Frío' },
  1: { en: 'Heating', fr: 'Chaud', de: 'Heizen', es: 'Calor' },
  2: { en: 'Dry', fr: 'Déshumidif.', de: 'Entfeuchten', es: 'Deshumidificar' },
  3: { en: 'Fan', fr: 'Ventilation', de: 'Lüften', es: 'Ventilación' },
  4: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
};
const MODE_COLORS = {
  0: WIDGET_COLORS.INFO,
  1: WIDGET_COLORS.WARNING,
  2: WIDGET_COLORS.PRIMARY,
  3: WIDGET_COLORS.PRIMARY,
  4: WIDGET_COLORS.SUCCESS,
};
const FAN_LABELS = {
  0: { en: 'Auto', fr: 'Auto', de: 'Auto', es: 'Auto' },
  1: { en: 'Low', fr: 'Faible', de: 'Niedrig', es: 'Baja' },
  2: { en: 'Medium', fr: 'Moyenne', de: 'Mittel', es: 'Media' },
  3: { en: 'High', fr: 'Forte', de: 'Hoch', es: 'Alta' },
  4: { en: 'Turbo', fr: 'Turbo', de: 'Turbo', es: 'Turbo' },
  5: { en: 'Quiet', fr: 'Silence', de: 'Leise', es: 'Silencio' },
  6: { en: 'Medium-low', fr: 'Moy.-faible', de: 'Mittel-niedrig', es: 'Media-baja' },
  7: { en: 'Medium-high', fr: 'Moy.-forte', de: 'Mittel-hoch', es: 'Media-alta' },
};

const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Join multi-language fragments (or plain strings) language by language.
function join(parts, separator = ' · ') {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      parts.map((part) => (typeof part === 'string' ? part : part[lang])).join(separator),
    ]),
  );
}

const celsius = (tenths) =>
  typeof tenths === 'number' ? `${(Math.round(tenths) / 10).toString()} °C` : undefined;

/**
 * One status row summarizing a unit: offline, off, or what it is doing.
 */
export function unitSummary(device) {
  const params = device.params ?? {};
  if (!device.online) {
    return { value: T.offline, color: WIDGET_COLORS.NEUTRAL };
  }
  if (kindOf(device) === DEVICE_KINDS.HEAT_PUMP) {
    const parts = [];
    if (params[HP.HEATING_POWER] === 1) {
      parts.push(T.heating);
    }
    if (params[HP.WATER_POWER] === 1) {
      parts.push(T.hotWater);
    }
    if (parts.length === 0) {
      return { value: T.off, color: WIDGET_COLORS.NEUTRAL };
    }
    return { value: join(parts), color: WIDGET_COLORS.WARNING };
  }
  if (params[AC.ERROR_FLAG] === 1) {
    return {
      value: join([MODE_LABELS[params[AC.MODE]] ?? T.on, '⚠']),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (params[AC.POWER] !== 1) {
    return { value: T.off, color: WIDGET_COLORS.NEUTRAL };
  }
  const parts = [MODE_LABELS[params[AC.MODE]] ?? T.on];
  const target = celsius(params[AC.TARGET_TEMPERATURE]);
  if (target) {
    parts.push(target);
  }
  return { value: join(parts), color: MODE_COLORS[params[AC.MODE]] ?? WIDGET_COLORS.SUCCESS };
}

function overviewContent(runtime) {
  const devices = runtime.supportedDevices();
  const components = [];
  if (!runtime.connected && runtime.lastMessage) {
    components.push({ type: 'text', variant: 'caption', text: T.disconnected });
  }
  if (devices.length === 0) {
    components.push({ type: 'text', text: T.noDevice });
  } else {
    components.push({
      type: 'status',
      items: devices.slice(0, 10).map((device) => ({
        label: deviceName(device).slice(0, 40),
        icon: kindOf(device) === DEVICE_KINDS.HEAT_PUMP ? 'droplet' : 'wind',
        ...unitSummary(device),
      })),
    });
    components.push({
      type: 'button',
      label: T.allOff,
      icon: 'power',
      style: 'danger',
      action: { key: OVERVIEW_ACTIONS.TURN_OFF_ALL, confirm: true },
    });
  }
  components.push({
    type: 'button',
    label: T.refresh,
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: OVERVIEW_ACTIONS.REFRESH },
  });
  return { ttl_seconds: 60, components };
}

function hasFeature(device, key) {
  return featuresOf(device).some((feature) => feature.key === key && feature.toAux !== undefined);
}

function airConditionerContent(gladys, device) {
  const ids = externalIdsOf(gladys, device);
  const params = device.params ?? {};
  const isOn = params[AC.POWER] === 1;
  const target =
    typeof params[AC.TARGET_TEMPERATURE] === 'number'
      ? params[AC.TARGET_TEMPERATURE] / 10
      : undefined;
  const components = [
    {
      type: 'value',
      label: T.room,
      icon: 'thermometer',
      device_feature: ids.feature(FEATURE_KEYS.AMBIENT_TEMPERATURE),
    },
    {
      type: 'value',
      label: T.target,
      icon: 'target',
      device_feature: ids.feature(FEATURE_KEYS.TARGET_TEMPERATURE),
    },
    {
      type: 'status',
      items: [
        { label: T.power, icon: 'power', ...unitSummary(device) },
        {
          label: T.fan,
          icon: 'wind',
          value: FAN_LABELS[params[AC.FAN_SPEED]] ?? '—',
          color: WIDGET_COLORS.NEUTRAL,
        },
      ],
    },
  ];
  if (device.online) {
    if (hasFeature(device, FEATURE_KEYS.POWER)) {
      components.push({
        type: 'button',
        label: isOn ? T.turnOff : T.turnOn,
        icon: 'power',
        style: isOn ? 'secondary' : 'primary',
        device_feature: ids.feature(FEATURE_KEYS.POWER),
        value: isOn ? 0 : 1,
      });
    }
    if (target !== undefined && hasFeature(device, FEATURE_KEYS.TARGET_TEMPERATURE)) {
      const down = Math.max(AC_TEMPERATURE_RANGE.min, target - 0.5);
      const up = Math.min(AC_TEMPERATURE_RANGE.max, target + 0.5);
      components.push(
        {
          type: 'button',
          label: `${down} °C`,
          icon: 'minus',
          style: 'secondary',
          device_feature: ids.feature(FEATURE_KEYS.TARGET_TEMPERATURE),
          value: down,
        },
        {
          type: 'button',
          label: `${up} °C`,
          icon: 'plus',
          style: 'secondary',
          device_feature: ids.feature(FEATURE_KEYS.TARGET_TEMPERATURE),
          value: up,
        },
      );
    }
  }
  return components;
}

function heatPumpContent(gladys, device) {
  const ids = externalIdsOf(gladys, device);
  const params = device.params ?? {};
  const tank = params[HP.WATER_TANK_TEMPERATURE];
  const tankTenths =
    typeof tank === 'number' ? (isV3HeatPump(device) ? tank : tank * 10) : undefined;
  const components = [
    {
      type: 'value',
      label: T.tank,
      icon: 'thermometer',
      device_feature: ids.feature(FEATURE_KEYS.WATER_TANK_TEMPERATURE),
    },
    {
      type: 'value',
      label: T.target,
      icon: 'target',
      device_feature: ids.feature(FEATURE_KEYS.WATER_TARGET_TEMPERATURE),
    },
    {
      type: 'status',
      items: [
        { label: T.power, icon: 'power', ...unitSummary(device) },
        {
          label: T.tank,
          icon: 'droplet',
          value: celsius(tankTenths) ?? '—',
          color: WIDGET_COLORS.NEUTRAL,
        },
      ],
    },
  ];
  if (device.online) {
    const heatingOn = params[HP.HEATING_POWER] === 1;
    const waterOn = params[HP.WATER_POWER] === 1;
    components.push(
      {
        type: 'button',
        label: join([T.heating, heatingOn ? T.off : T.on], ' '),
        icon: 'sun',
        style: heatingOn ? 'secondary' : 'primary',
        device_feature: ids.feature(FEATURE_KEYS.HEATING_POWER),
        value: heatingOn ? 0 : 1,
      },
      {
        type: 'button',
        label: join([T.hotWater, waterOn ? T.off : T.on], ' '),
        icon: 'droplet',
        style: waterOn ? 'secondary' : 'primary',
        device_feature: ids.feature(FEATURE_KEYS.WATER_POWER),
        value: waterOn ? 0 : 1,
      },
    );
  }
  return components;
}

export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    async get({ runtime }) {
      logger.debug(`onWidgetGet <- ${OVERVIEW_WIDGET}`);
      return overviewContent(runtime);
    },

    async action({ runtime }, { actionKey }) {
      logger.info(`onWidgetAction <- ${OVERVIEW_WIDGET}.${actionKey}`);
      if (actionKey === OVERVIEW_ACTIONS.TURN_OFF_ALL) {
        const count = await turnOffAll(runtime);
        return {
          en: `${count} unit(s) turned off.`,
          fr: `${count} appareil(s) éteint(s).`,
          de: `${count} Gerät(e) ausgeschaltet.`,
          es: `${count} equipo(s) apagado(s).`,
        };
      }
      if (actionKey === OVERVIEW_ACTIONS.REFRESH) {
        await runtime.refresh();
        return {
          en: 'AUX units refreshed.',
          fr: 'Appareils AUX actualisés.',
          de: 'AUX-Geräte aktualisiert.',
          es: 'Equipos AUX actualizados.',
        };
      }
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },

  [UNIT_WIDGET]: {
    async get({ gladys, runtime }, { settings = {} }) {
      logger.debug(`onWidgetGet <- ${UNIT_WIDGET}`);
      const device = settings.device ? runtime.findDevice(settings.device) : undefined;
      if (!device) {
        return { ttl_seconds: 60, components: [{ type: 'text', text: T.chooseDevice }] };
      }
      const components =
        kindOf(device) === DEVICE_KINDS.HEAT_PUMP
          ? heatPumpContent(gladys, device)
          : airConditionerContent(gladys, device);
      return { ttl_seconds: 60, components };
    },
  },
};

/**
 * Freshness nudge: ask the core to re-pull every widget now. Rate-limited
 * core-side (1 per 10 s per widget) and dropped while disconnected, so it is
 * also sent after every (re)connection.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
