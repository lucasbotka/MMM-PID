# Changelog

## Unreleased

### Changed

- Redesigned departure board: one line per departure with line number, destination, departure time and countdown, grouped under each stop
- The departure time now shows the predicted time (including delay) and the countdown is derived from it
- Delay is shown as a red `+X min` badge
- Transport type icon moved from each row to the stop name
- Departure times are always shown in Prague time, regardless of the mirror's time zone
- Board text is slightly smaller (0.85 of MagicMirror's small font)
- The board is only as wide as its content, so it no longer stretches its region and pushes other modules out of alignment
- The board follows the region's alignment (right in right regions, centered in center regions)

### Added

- Trip destination (headsign) is shown for every departure

### Note

- CSS classes changed (`.pid-departures-table`, `.departs-in-text` and `.pid-departure-time` are gone). If you restyled the module in `custom.css`, update your selectors. The configuration is unchanged.
