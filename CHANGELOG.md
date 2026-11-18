# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The departure time no longer shifts out of its column for departures 100 or more minutes away, and a delay of 100+ minutes no longer overflows past the edge of the board.

## [1.0.0] - 2026-11-09

### Changed

- Redesigned departure board: one compact line per departure (line, destination, departure time, countdown) grouped under each stop. The time already includes the delay, which is shown as a red `+X` after the countdown.

### Note

- CSS classes changed (`.pid-departures-table`, `.departs-in-text` and `.pid-departure-time` were removed). If you restyled the module in `custom.css`, update your selectors. The configuration is unchanged.

[Unreleased]: https://github.com/lucasbotka/MMM-PID/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lucasbotka/MMM-PID/releases/tag/v1.0.0
