# AUX Cloud (AC Freedom)

Control your **AUX** air conditioners and heat pumps from Gladys, through the
AUX cloud used by the **AC Freedom** mobile app. Every unit paired in the app
(including the units other accounts share with you) shows up in Gladys.

> The integration talks to the AUX cloud only: your units and Gladys need an
> Internet connection. AUX publishes no official API: the integration speaks
> the protocol of the AC Freedom app, as reverse-engineered by the
> [ha-aux-cloud](https://github.com/maeek/ha-aux-cloud) project.

## Before you start

1. Pair your units in the **AC Freedom** app and check that you can control
   them from it.
2. Recommended: create a **second AC Freedom account** for Gladys, and share
   your units with it from the app (_Device → Share_). The AUX cloud keeps one
   session per account: with a dedicated account, Gladys never logs your
   phone out (and the other way round).

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **e-mail or phone number** and the **password** of the account.
3. Choose the **cloud region** your account was created on: _Europe_ for most
   European users, _United States_, _China_ or _Russia_ otherwise. A wrong
   region looks like a wrong password.
4. The **refresh interval** sets how often the units are read from the cloud
   (60 seconds by default, 30 seconds at least). Changes made with the remote
   or the app reach Gladys at the next refresh; commands sent from Gladys are
   applied at once.
5. Save, then click **Test the connection**: it tells how many units were
   found. Open the **Discovery** tab and add your units.

## What you get

**Air conditioners**

| Feature                                                                                             | Notes                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Power                                                                                               | on / off                                                                                   |
| Mode                                                                                                | auto, cooling, heating, dry, fan                                                           |
| Target temperature                                                                                  | 16 to 32 °C, half-degree steps                                                             |
| Fan speed                                                                                           | auto, quiet, low, medium, high, turbo (and the intermediate speeds when the unit has them) |
| Vertical / horizontal swing                                                                         | when the unit supports it                                                                  |
| Room temperature                                                                                    | measured by the indoor unit                                                                |
| Eco, sleep, display, health, auxiliary heat, self clean, child lock, mildew proof, comfortable wind | only the ones your unit reports                                                            |

**Heat pumps**: heating on/off and target temperature, hot water on/off,
target and tank temperatures, fast hot water, quiet and eco modes.

Each unit carries a **cloud** badge, which turns to **unreachable** when the
unit is offline in the AUX cloud.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or
later), under the **Integrations** category.

Triggers:

- **AUX unit turned on or off** — from Gladys, the remote or the app.
  Optionally pick the unit and the new state. The new state is available as
  `{{triggerEvent.data.state}}` (`on` / `off`).
- **AUX unit reports an error** — the unit raised its error flag; the code
  is available as `{{triggerEvent.data.error_code}}`.
- **AUX unit online or offline** — a unit lost or regained its connection.

Actions:

- **Set an air conditioner** — power, mode, target temperature and fan speed
  in a single command. Empty fields are left unchanged. Returns whether a
  command was sent.
- **Set heat pump hot water** — hot water on/off, setpoint and fast heating.
- **Turn off all AUX units** — e.g. when the last person leaves home. Returns
  the number of units turned off.

The standard Gladys device cards (set a feature value, "device state"
trigger...) work as well with every feature above.

## Dashboard

- **AUX units** widget: every unit at a glance (off, mode and setpoint,
  offline, error), with **All off** and **Refresh** buttons.
- **AUX unit** widget: pick one unit in the widget settings to get its live
  temperatures and quick controls (on/off, setpoint −0.5 °C / +0.5 °C; heating
  and hot water switches for a heat pump).

## Troubleshooting

- **"AUX Cloud refused the login"**: check the account, the password and the
  region. Log in to the AC Freedom app with the same account to be sure.
- **"AUX Cloud is limiting requests"**: increase the refresh interval.
- **A unit is missing**: it must be visible in the AC Freedom app with the
  same account. Units added to the account later are picked up within an
  hour, or at once with **Test the connection** or a new scan.
- **A feature is missing**: optional features are only published when the
  unit reports them.

Check the integration logs from the Gladys UI for the details. Passwords and
session tokens are never written to the logs.
