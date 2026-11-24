import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDiscoveredDevices, externalIdsOf } from '../src/devices/index.js';
import { OVERVIEW_WIDGET, UNIT_WIDGET, WIDGETS, refreshWidgets } from '../src/widgets.js';
import { makeAirConditioner, makeHeatPump } from './helpers/fakeAuxCloud.js';
import { startRuntime } from './helpers/runtime.js';

const request = (settings = {}) => ({ settings, language: 'en', units: 'metric' });

const fleet = () => [
  makeAirConditioner(),
  makeAirConditioner({ endpointId: 'ac0002', friendlyName: 'Bedroom', online: false }),
  makeAirConditioner({
    endpointId: 'ac0003',
    friendlyName: 'Office',
    params: { ...makeAirConditioner().params, err_flag: 1 },
  }),
  makeHeatPump(),
];

test('the overview content is rendered exactly as sent', async () => {
  const { context } = await startRuntime({ devices: fleet() });
  const content = await WIDGETS[OVERVIEW_WIDGET].get(context, request());
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 4);
  assert.ok(
    status.items.some((item) => item.color === 'danger'),
    'the unit in error stands out',
  );
});

test('the overview without any unit is valid too', async () => {
  const { context } = await startRuntime({ devices: [] });
  const content = await WIDGETS[OVERVIEW_WIDGET].get(context, request());
  assert.deepEqual(validateWidgetContent(content), []);
});

test('the overview buttons are handled and answer a short toast in every language', async () => {
  const { context, cloud } = await startRuntime({ devices: fleet() });
  const content = await WIDGETS[OVERVIEW_WIDGET].get(context, request());
  const buttons = content.components.filter((c) => c.type === 'button' && c.action);
  assert.equal(buttons.length, 2);
  for (const { action } of buttons) {
    const message = await WIDGETS[OVERVIEW_WIDGET].action(context, {
      actionKey: action.key,
      params: action.params ?? {},
      settings: {},
    });
    for (const lang of ['en', 'fr', 'de', 'es']) {
      assert.ok(message[lang] && message[lang].length <= 200, `toast in ${lang}`);
    }
  }
  assert.equal(cloud.devices[0].params.pwr, 0, 'all off turned the living room off');
  await assert.rejects(
    WIDGETS[OVERVIEW_WIDGET].action(context, { actionKey: 'nope', params: {}, settings: {} }),
    /Unknown widget action/,
  );
});

test('the unit widget renders an air conditioner and a heat pump', async () => {
  const { gladys, context, runtime } = await startRuntime({ devices: fleet() });
  const featureIds = new Set(
    buildDiscoveredDevices(gladys, runtime.devices).flatMap((d) =>
      d.features.map((f) => f.external_id),
    ),
  );
  for (const device of runtime.devices) {
    const content = await WIDGETS[UNIT_WIDGET].get(
      context,
      request({ device: externalIdsOf(gladys, device).device }),
    );
    assert.deepEqual(validateWidgetContent(content), [], device.friendlyName);
    for (const component of content.components.filter((c) => c.device_feature)) {
      assert.ok(
        featureIds.has(component.device_feature),
        `unknown feature ${component.device_feature}`,
      );
    }
  }
});

test('the unit widget asks for a unit when none is chosen', async () => {
  const { context } = await startRuntime({ devices: fleet() });
  const content = await WIDGETS[UNIT_WIDGET].get(context, request());
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
