# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **AUX** air conditioners and
heat pumps, controlled through the AUX cloud of the **AC Freedom** app
(BroadLink DNA platform). A Node.js service (Node 22+, ESM, no build step)
that runs in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js);
the cloud protocol is ported from
[ha-aux-cloud](https://github.com/maeek/ha-aux-cloud) (MIT, see
`THIRD_PARTY_NOTICES.md`).

The integration is **cloud only** (`transports: ["cloud"]` in the manifest):
there is no LAN channel to AUX units.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/devices.test.js          # one file
node --test --test-name-pattern "climate" # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                 SDK wiring only: handlers registered before connect()
src/aux/client.js        AUX cloud client: login (AES), families, devices, get/set params
src/aux/errors.js        typed cloud errors (auth, session, rate limit, device...)
src/aux/profiles.js      product profiles (productId -> capabilities), wire encodings
src/devices/features.js  Gladys features <-> AUX parameters, both directions
src/devices/index.js     discovery payload, states, command routing (pure functions)
src/runtime.js           client + inventory + refresh loop, publishes states/events
src/triggers.js          scene triggers fired on the edges between two snapshots
src/scenes.js            scene action handlers (manifest `scene_actions`)
src/widgets.js           dashboard widget handlers (manifest `widgets`)
src/actions.js           Configuration screen buttons (manifest `actions`)
src/config.js            DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md    user documentation, re-hosted by Gladys (en and fr mandatory)
test/                    node --test, fake Gladys (SDK) + fake AUX cloud (test/helpers)
```

One timer refreshes the whole account (`poll_frequency` seconds): a batched
online-state query, then the parameters of the online units. Gladys' own
device polling is not used. The account is re-listed every hour.

## Rules

- **External ids are forever.** Devices are `gladys.externalIds('ac' |
'heat-pump', endpointId)`, the AUX cloud `endpointId`; features append the
  keys of `FEATURE_KEYS` (`src/devices/features.js`). Never rename one: it
  creates a new device and orphans the old one. The same goes for every key
  users store: manifest `config_schema`, `actions`, widget and scene keys,
  trigger option values (`on`/`off`, `online`/`offline`...).
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`**: Gladys stores them NOT NULL. `test/devices.test.js`
  checks them.
- **AUX wire formats.** Temperatures are tenths of a degree on the wire
  (`temp: 225` is 22.5 °C), except the tank temperature of pre-v3 heat pumps
  (whole degrees). Some products encode the half degree in `ac_tempdec`, and
  Fahrenheit units in `ac_tempconvert`: always go through
  `encodeAcTemperature` / `normalizeParams`. AUX modes and fan speeds are
  mapped to the Gladys `AC_MODE` / `AC_FAN_SPEED` enums in `features.js`.
- **Secrets.** The password is a `secret` field: never log it, nor the
  `loginsession`, the `userid` or the device cookies (they hold the per-device
  AES key). Log error kinds and codes only.
- **The container rootfs is read-only.** Write only under `/data` (nothing is
  persisted today).
- **Tests never touch the network**: use `test/helpers/fakeAuxCloud.js`, and
  add the endpoint there when the client calls a new one.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects. The catalog `description`
  holds 10 to 100 characters per language. `test/manifest.test.js` ties the
  manifest to the code (defaults, action, scene, trigger and widget keys):
  change both sides together.
- **Four languages.** Every user-facing text exists in English, French,
  German and Spanish: manifest texts (checked by `test/manifest.test.js`),
  action and widget messages, connection status messages and
  `docs/{en,fr,de,es}.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English.
