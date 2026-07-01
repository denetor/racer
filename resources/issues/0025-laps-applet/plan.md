# Plan: Lap-times applet (issue 0025)

> Source PRD: `resources/issues/0025-laps-applet/prd.md`
> Decision log: `resources/issues/0025-laps-applet/grill-me-out.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **New module**: a standalone `LapsAppletActor` (Excalibur `ScreenElement`) under `src/ui/`, following the `*.actor.ts` convention. It is its own window, not a child of `DrivingDashboardActor`.
- **Rendering**: a single `Canvas({cache:false})` whose `draw` callback fills a translucent black background (`rgba(0,0,0,0.5)`) then draws four labelled text rows. Redraws every frame.
- **Dimensions**: fixed pixel module constants (in the style of `PEDALS_*`) — applet width, row height, padding, top/right edge margin. Height = 4 rows + padding; width fits the longest row in monospace.
- **Position**: top-right, `x = engine.screen.width − appletWidth − margin` recomputed every frame in `onPreUpdate`; fixed top `y`.
- **Data access**: scene injects the `RaceData` object + `playerId` via `setRaceData(raceData, playerId)`; the live `timeIntoScene` is read each frame by casting `this.scene` (as `CheckpointActor` does).
- **Rows / labels**: `CUR`, `Δ`, `BEST`, `LAST`, left-aligned, monospace.
- **Format**: lap/current times `M:SS.mmm`; delta `+/-S.mmm`.
- **Colors**: neutral yellow `rgba(255,255,0,1)`; delta faster green `rgba(0,255,0,1)`, slower red `rgba(255,0,0,1)`; background `rgba(0,0,0,0.5)`.
- **Best lap**: fastest lap with `valid === true` and smallest `timeMs`.
- **Pure helpers** (extracted, exported, unit-tested): `formatLapTime`, `findBestLap`, `computeDelta`.
- **Reused models (unchanged)**: `RaceData` → `VehicleRaceData` (`laps[]`, `completedLaps`) → `LapTime` (`currentLapStart`, `timeMs`, `valid`, `checkpointTimes: Map<order, msFromLapStart>`). Current lap = `laps[completedLaps]`; last completed lap = `laps[completedLaps − 1]`.
- **Scene wiring**: `PhysicsPlaygroundScene` only (`START_SCENE='physics'`). Orphan `PlaygroundScene` untouched.
- **Tests**: Jest, mirroring `src/ui/acceleration-applet.actor.test.ts` / `pedals-applet.actor.test.ts` mock pattern, in `src/ui/laps-applet.actor.test.ts`. Rendering/layout verified visually by the user.
- **Integration**: adding visible UI to the screenshotted scene requires regenerating the Playwright baseline (`npm run test:integration-update`) and committing the new PNGs.

---

## Phase 1: Applet on screen (skeleton tracer bullet)

**User stories**: 9, 10, 11, 12, 14, 18

### What to build

A `LapsAppletActor` that renders end-to-end and is wired into `PhysicsPlaygroundScene`. It draws the translucent window and all four labelled rows using static placeholder values (`CUR 0:00.000`, `Δ +0.000`, `BEST --:--.---`, `LAST --:--.---`) in the monospace/yellow style. It anchors to the top-right corner and repositions every frame against `engine.screen.width`. No live data is read yet; `setRaceData` exists and is called by the scene but its data is not yet consumed. This proves every integration layer: actor creation, canvas rendering, fixed sizing, right-edge positioning, and scene wiring.

### Acceptance criteria

- [ ] A new `LapsAppletActor` (`ScreenElement`) exists under `src/ui/` with fixed-pixel dimension constants.
- [ ] It renders a translucent black window with the four labelled placeholder rows in monospace yellow text.
- [ ] It is added to `PhysicsPlaygroundScene.onInitialize`, and `setRaceData(this.raceData, 'Player1')` is called.
- [ ] It sits in the top-right corner and stays glued to the right edge when the window/screen width changes (x recomputed each frame in `onPreUpdate`).
- [ ] The orphan `PlaygroundScene` is unchanged.
- [ ] A sizing sanity unit test asserts the applet constructs with the expected fixed dimensions (mirroring the existing applet tests).
- [ ] User visually confirms placement, style, and resize behavior.

---

## Phase 2: Live current-lap timer

**User stories**: 1, 2, 8, 13, 14, 16

### What to build

Replace the CUR placeholder with the live current-lap time driven by real data. Each frame the applet reads `timeIntoScene` from the scene and the current lap (`laps[completedLaps]`) and shows `timeIntoScene − currentLapStart`, formatted by the pure `formatLapTime(ms)` helper. Handles the state rules: `0:00.000` before the first finish-line crossing (no active lap), running while a lap is active (resets naturally each finish-line crossing because `currentLapStart` advances), and frozen at the last completed lap's `timeMs` once the race is finished.

### Acceptance criteria

- [ ] `formatLapTime(ms)` is an exported pure function producing `M:SS.mmm` (2-digit seconds, 3-digit millis).
- [ ] `formatLapTime` unit tests cover: sub-minute, over-a-minute, zero, and millisecond padding/rounding.
- [ ] CUR shows `0:00.000` before the first finish-line crossing.
- [ ] CUR runs live while a lap is active and restarts at each finish-line crossing.
- [ ] CUR freezes at the last completed lap's time once the race is finished.
- [ ] User visually confirms the timer ticks, resets per lap, and freezes at race end.

---

## Phase 3: Best & last lap rows

**User stories**: 3, 4, 16

### What to build

Wire the BEST and LAST rows to real data. BEST uses the pure `findBestLap(laps)` helper (fastest lap with `valid === true` and smallest `timeMs`), formatted with `formatLapTime`. LAST shows the last completed lap (`laps[completedLaps − 1]`). Both display the `--:--.---` placeholder until a valid lap exists.

### Acceptance criteria

- [ ] `findBestLap(laps)` is an exported pure function returning the fastest valid lap (or none).
- [ ] `findBestLap` unit tests cover: no laps, only invalid laps, and multiple valid laps (returns smallest `timeMs`).
- [ ] BEST shows the fastest valid lap time; `--:--.---` until one exists.
- [ ] LAST shows the most recently completed valid lap time; `--:--.---` until one exists.
- [ ] User visually confirms BEST/LAST update on lap completion.

---

## Phase 4: Delta line, colors, and baseline regeneration

**User stories**: 5, 6, 7, 15, 16, 17

### What to build

Add the live delta. The pure `computeDelta(currentLap, bestLap)` helper returns the signed millisecond delta at the most-recently-crossed checkpoint of the current lap (`currentLap.checkpointTimes.get(lastOrder) − bestLap.checkpointTimes.get(lastOrder)`, where `lastOrder` is the last inserted key of the current lap's `checkpointTimes` map), or a neutral marker when there is no usable reference. The Δ row renders this via the delta format (`+/-S.mmm`), colored green when faster, red when slower, and neutral yellow `+0.000` when there is no reference; the value holds between checkpoint crossings. Finally, regenerate and commit the Playwright baseline for the now-complete UI.

### Acceptance criteria

- [ ] `computeDelta(currentLap, bestLap)` is an exported pure function returning the signed ms delta at the last-passed checkpoint, or a neutral marker with no reference.
- [ ] `computeDelta` unit tests cover: faster (negative), slower (positive), no best lap (neutral), best lap missing the current checkpoint split (neutral), and last-passed-checkpoint selection from an insertion-ordered map.
- [ ] Δ shows `+/-S.mmm`, colored green (faster) / red (slower), and updates on each checkpoint crossing, holding between crossings.
- [ ] Δ shows neutral yellow `+0.000` when there is no best-lap reference.
- [ ] The Δ glyph renders in the chosen monospace font (fallback to a text label if not).
- [ ] Playwright baseline regenerated (`npm run test:integration-update`) and the new PNG snapshots committed; integration tests pass.
- [ ] User visually confirms delta sign, color, and update timing while driving.
