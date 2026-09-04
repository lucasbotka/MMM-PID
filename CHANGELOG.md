# Changelog

## Unreleased

### Changed

- Redesigned the departure board. Each departure is now a three column row - line
  number, destination with the departure time, and a large countdown in minutes.
  The transport mode icon moved from every row into the stop heading, which shows
  one icon per mode the stop serves.
- The destination of the trip is now displayed.
- A delay no longer recolors the row. The board shows the time the vehicle is
  really expected and adds a `zpoždění X min` / `X min late` note next to it.
- The countdown is derived from the same timestamp as the displayed time, so the
  two can no longer disagree on a delayed trip.

### Added

- `departureTimeSource` option - `"predicted"` (default, schedule plus delay) or
  `"scheduled"` (timetable time). It moves the displayed time and the countdown
  together.

### Removed

- The repeated "odjíždí za" / "departs in" label on every row. The `min` unit next
  to the countdown carries the meaning.

### Note for users with custom CSS

The markup changed from a `<table>` to a grid. Rules targeting
`.pid-departures-table`, `.departs-in-text`, `.pid-departure-time`,
`.pid-wheelchair` or `.pid-air-conditioned` no longer match anything, and
`.pid-line-name` and `.pid-minutes` now sit on different elements. Configuration
options are unaffected.
