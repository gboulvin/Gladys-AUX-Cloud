# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First release: AUX air conditioners and heat pumps controlled through the
  AC Freedom cloud (Europe, United States, China and Russia regions),
  personal and shared units alike.
- Air conditioners: power, mode, target temperature (half-degree steps), fan
  speed, vertical and horizontal swing, room temperature, and the eco, sleep,
  display, health, auxiliary heat, self clean, child lock, mildew proof and
  comfortable wind switches the unit reports.
- Heat pumps: heating power and setpoint, hot water power, setpoint and tank
  temperature, fast hot water, quiet and eco modes.
- Scene triggers: unit turned on or off, unit reports an error, unit online
  or offline.
- Scene actions: set an air conditioner (power, mode, setpoint, fan speed in
  one command), set heat pump hot water, turn off all units.
- Dashboard widgets: overview of every unit with an "All off" button, and a
  per-unit widget with live temperatures and quick controls.
- Cloud transport badge, unreachable when a unit is offline.
- "Test the connection" button in the Configuration screen.
- English, French, German and Spanish texts and documentation.
- `SECURITY.md`, `CLAUDE.md` and this changelog.

[Unreleased]: https://github.com/gboulvin/Gladys-AUX-Cloud/commits/main
