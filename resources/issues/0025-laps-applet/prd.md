# PRD: Lap-times applet (issue 0025)

## Problem Statement

While driving, the player has no on-screen feedback about their lap performance. They cannot see how long the current lap has been running, how they are doing compared to their best lap, what their best lap time is, or what their last lap took. All of this information already exists in the game's lap-timing data structures but is only printed to the developer console, so it is invisible during actual play.

## Solution

Add a small semi-transparent applet anchored to the top-right corner of the screen that continuously displays the player's lap times, in the same visual style as the existing driving applets. It shows four pieces of information:

- **Current lap timer** — the elapsed time of the lap in progress, updated every frame.
- **Delta vs best lap** — how far ahead or behind the best lap the player is at the checkpoint they most recently crossed, colored green when faster and red when slower.
- **Best lap time** — the player's fastest valid completed lap.
- **Last lap time** — the most recently completed lap.

The best-lap, last-lap, and delta values change on lap/checkpoint events (a lap begins and ends when crossing the `finish-line` checkpoint), while the current-lap timer ticks every frame. The applet is positioned relative to the right edge so it remains correctly placed if the screen is resized or scaled in the future.

## User Stories

1. As a player, I want to see the current lap's elapsed time updating in real time, so that I can gauge my pace during the lap.
2. As a player, I want the current-lap timer to start from zero each time I cross the finish line, so that it always reflects the lap in progress.
3. As a player, I want to see my best lap time, so that I have a target to beat.
4. As a player, I want to see the time of the lap I just completed, so that I can tell whether I am improving.
5. As a player, I want a live delta against my best lap at each checkpoint, so that I know whether I am currently gaining or losing time.
6. As a player, I want the delta shown in green when I am faster than my best and red when I am slower, so that I can read my performance at a glance without parsing numbers.
7. As a player, I want the delta to update every time I cross a checkpoint and hold that value until the next checkpoint, so that it is stable enough to read while driving.
8. As a player, I want lap times displayed in a familiar `M:SS.mmm` racing format, so that times over a minute read naturally.
9. As a player, I want the applet in the top-right corner and out of the way of the existing bottom/left instruments, so that it does not obstruct the action.
10. As a player, I want the applet to stay glued to the right edge even if the window is resized or scaled, so that it never drifts off-screen or overlaps other UI.
11. As a player, I want the applet to look consistent with the other applets (semi-transparent dark window, yellow text), so that the HUD feels cohesive.
12. As a player, I want sensible placeholder values before I have set any lap times, so that the applet is never blank or confusing at the start of a race.
13. As a player, I want the current-lap timer to freeze on my final lap time once the race is finished, so that I can see my closing lap rather than a reset-to-zero timer.
14. As a player starting a session, I want the current timer to read `0:00.000` before I first cross the finish line, so that it clearly indicates no lap has begun.
15. As a player, I want a neutral delta (`+0.000`, non-colored) before I have a best lap to compare against, so that the delta line is not misleadingly colored early on.
16. As a developer, I want the applet's time-formatting, best-lap selection, and delta computation extracted into pure functions, so that I can unit-test the logic without a running game.
17. As a developer, I want the display glue to remain thin and verified visually, so that I do not over-test rendering details that change often.
18. As a developer, I want the applet wired only into the active production scene, so that I do not modify dead/orphan code.

## Implementation Decisions

### New module: `LapsAppletActor`

- A self-contained Excalibur `ScreenElement` (a new UI actor under `src/ui/`, following the `*.actor.ts` convention). It is **its own standalone window**, not a child of the existing top-left `DrivingDashboardActor`, so it is not constrained to that dashboard's height and keeps its top-right positioning isolated.
- Renders with a **single `Canvas({cache:false})`** whose `draw` callback first fills a translucent black rectangle (`rgba(0,0,0,0.5)`) for the window background, then draws the four labelled text rows. This mirrors the acceleration applet's single-canvas approach and gives exact control of window size. Being `cache:false`, it redraws every frame, which also drives the live current-lap timer.
- **Dimensions** are fixed pixel constants (in the style of the existing `PEDALS_*` constants): an applet width, a per-row height, padding, and a right/top edge margin. Width is sized to fit the longest row in the monospace font; height = 4 rows × row height + padding.

### Positioning

- Anchored to the **top-right**. In `onPreUpdate`, `x` is recomputed every frame as `engine.screen.width − appletWidth − margin`; `y` is a fixed top margin. This tracks the current screen width so the applet survives runtime resize/scaling. (The existing dashboard reads width only once at init; this applet deliberately does not.)

### Data access

- The scene **injects** the `RaceData` object and the target `playerId` into the applet via a setter (e.g. `setRaceData(raceData, playerId)`), keeping the lap-data dependency explicit.
- The applet reads the **live master clock** (`timeIntoScene`) from its scene each frame by casting `this.scene` to a type that exposes `timeIntoScene`, exactly as `CheckpointActor` already casts. This is required because the clock advances every frame and cannot be injected once.

### Displayed rows

Four left-aligned rows, short English labels + formatted value, in a monospace font:

- `CUR` — current lap time.
  - While a lap is active: `timeIntoScene − currentLap.currentLapStart`.
  - Before the first finish-line crossing (no active lap ever): `0:00.000`.
  - After the race is finished (no active lap because none was created past the last lap): **frozen** at the last completed lap's `timeMs`.
- `Δ` — delta at the most-recently-crossed checkpoint of the current lap: `currentLap.checkpointTimes.get(lastOrder) − bestLap.checkpointTimes.get(lastOrder)`, where `lastOrder` is the last entry in the current lap's insertion-ordered `checkpointTimes` map. Since splits are cumulative from lap start, this equals the elapsed-since-lap-start difference at that checkpoint. Updates on each checkpoint crossing, holds between crossings.
  - Negative → green (`rgba(0,255,0,1)`, faster); positive → red (`rgba(255,0,0,1)`, slower).
  - When there is no usable reference (no valid best lap yet, or the best lap has no split for that checkpoint): `+0.000` in neutral yellow.
- `BEST` — the fastest valid completed lap's `timeMs`; `--:--.---` until one exists.
- `LAST` — the last completed (valid) lap's `timeMs`; `--:--.---` until one exists.

The window keeps a constant size/shape from the start; only the values change (fixed layout, never blank).

### Best-lap definition

- Best lap = the completed lap with `valid === true` and the smallest `timeMs`.

### Formatting

- Lap/current times: `M:SS.mmm` (minutes:seconds.milliseconds), seconds zero-padded to 2 digits, millis to 3 (e.g. `1:07.482`).
- Delta: signed seconds form `+/-S.mmm` (e.g. `-0.253`).

### Colors and font

- Neutral text (labels, `CUR`, `BEST`, `LAST`, neutral `Δ`): yellow `rgba(255,255,0,1)` — matches the other applets.
- Delta faster/slower: green `rgba(0,255,0,1)` / red `rgba(255,0,0,1)`.
- Window background: black `rgba(0,0,0,0.5)` — matches the dashboard.
- A monospace font family so digit widths stay constant and the running timer/columns do not jitter frame-to-frame.

### Extracted pure helpers

Logic is pulled out of the render method into pure, exported functions:

- `formatLapTime(ms)` → `M:SS.mmm` string.
- `findBestLap(laps)` → the fastest valid lap (or none).
- `computeDelta(currentLap, bestLap)` → signed ms delta at the last-passed checkpoint, or a neutral marker when there is no reference.

The view assembly and drawing remain inline in the render method (thin glue, verified visually).

### Scene wiring

- Added to **`PhysicsPlaygroundScene` only** — the production/active scene (`START_SCENE='physics'`). The orphan `PlaygroundScene` is left untouched.
- The applet is created and added in the scene's `onInitialize`, then `setRaceData(this.raceData, 'Player1')` is called.

### Data structures reused (unchanged)

- `RaceData` (on the scene): `players: Map<playerId, VehicleRaceData>`, `totalLaps`, `totalCheckpoints`.
- `VehicleRaceData`: `laps: LapTime[]`, `completedLaps`.
- `LapTime`: `currentLapStart`, `timeMs`, `valid`, `checkpointTimes: Map<order, msRelativeToLapStart>`.
- The current lap is `laps[completedLaps]`; the last completed lap is `laps[completedLaps − 1]`.

No changes to the lap-timing model are required. (Noted from the model: an invalid finish-line crossing does not start a new lap — the current lap simply keeps counting up.)

## Testing Decisions

- **What makes a good test here:** exercise external behavior (given lap data / a millisecond value, assert the produced string or numeric result), not rendering internals or private drawing calls. Rendering and layout are verified visually by the user, consistent with the project's manual-verification convention.
- **Modules tested:** the pure helpers `formatLapTime`, `findBestLap`, and `computeDelta`, plus a small sizing sanity test of the applet (that it constructs with the expected fixed dimensions), matching the existing applet tests.
- **Prior art:** `src/ui/acceleration-applet.actor.test.ts` and `src/ui/pedals-applet.actor.test.ts` — Jest with the same `excalibur`/vehicle/dashboard mock pattern, testing exported pure functions (`calcDotOffset`, `calcBarHeight`) and a construction/sizing assertion. The new tests live in `src/ui/laps-applet.actor.test.ts`.
- Representative cases to cover:
  - `formatLapTime`: sub-minute, over-a-minute, zero, millisecond padding/rounding.
  - `findBestLap`: no laps, only invalid laps, multiple valid laps (returns the smallest `timeMs`).
  - `computeDelta`: faster (negative), slower (positive), no best lap (neutral), best lap missing the current checkpoint split (neutral), last-passed-checkpoint selection from an insertion-ordered map.

## Out of Scope

- Multiplayer / multiple players' lap boards (only the single `Player1` is shown).
- Sector/split breakdown UI beyond the single most-recent-checkpoint delta.
- Persisting best laps across sessions or tracks.
- Changes to the lap-timing data model, checkpoint detection, or `finish-line` logic.
- Wiring the applet into the orphan `PlaygroundScene`.
- Configurable position, size, theming, font choice, or show/hide toggles.
- Live re-layout beyond horizontal right-edge anchoring (e.g. reflowing rows on vertical resize).
- Animations/transitions on value changes.

## Further Notes

- **Playwright baseline:** because this adds visible UI to the screenshotted production scene, the integration baseline must be regenerated (`npm run test:integration-update`) and the new PNG snapshots committed.
- The delta relies on `checkpointTimes` preserving insertion order (JS `Map` guarantees this), so "last-passed checkpoint" = the last inserted key.
- The `Δ` label uses the Unicode delta glyph; ensure the chosen monospace font renders it (fall back to `d`/`DELTA` text if it does not).
- See `resources/issues/0025-laps-applet/grill-me-out.md` for the full decision log behind this PRD.
