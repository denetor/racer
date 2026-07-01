# Grill-me: Lap-times applet (issue 0025)

Design interview for an on-screen applet showing the player's lap times.

## Question 1: How should the applet's "semitransparent window" be structured — its own standalone window, or a child of the existing full-width `DrivingDashboardActor`?

### Decision:
**Own standalone window.** Create a new independent `ScreenElement` with a black `rgba(0,0,0,0.5)` background, sized to fit its text lines, anchored to the top-right corner of the screen. It is self-contained and does not modify the existing top-left dashboard. This avoids being constrained to the dashboard's 64px height and keeps the top-right positioning logic isolated.

## Question 2: How should the top-right anchoring survive future screen resizing/scaling, given the existing dashboard only reads `engine.screen.width` once at init?

### Decision:
**Recompute `x` every frame.** In `onPreUpdate`, set `this.pos.x = engine.screen.width - windowWidth - margin` (a small constant right-edge margin). `y` stays at a fixed top margin. This always tracks the current screen width, so the applet stays glued to the right edge under runtime resize/scaling — directly satisfying the requirement.

## Question 3: How does the applet obtain the lap data (`RaceData`), the master clock (`timeIntoScene`), and the target player?

### Decision:
**Injected `raceData` + `playerId`.** The scene passes the `RaceData` object and the `playerId` into the applet via a setter (e.g. `setRaceData(raceData, playerId)`). The applet still reads the live `timeIntoScene` from `(this.scene as PlaygroundScene)` each frame for the running current-lap timer. This keeps the lap-data dependency explicit rather than relying on a scene-cast to reach `raceData`.

## Question 4: What time format and precision should lap/current times use?

### Decision:
**`M:SS.mmm`** — minutes:seconds.milliseconds with 3-digit millis, e.g. `1:07.482`. Seconds are zero-padded to 2 digits; millis to 3. This is the standard racing format and reads correctly for laps over a minute. The delta (Q6) uses a signed seconds form `+/-S.mmm` (e.g. `-0.253`). A pure `formatLapTime(ms)` function will produce this string and be unit-tested.

## Question 5: Which checkpoint does the delta refer to, and when does it update?

### Decision:
**Cumulative-vs-best at the last checkpoint passed.** The delta is `currentLap.checkpointTimes.get(lastOrder) − bestLap.checkpointTimes.get(lastOrder)`, where `lastOrder` is the most-recently-crossed checkpoint of the current lap (the last entry in the current lap's `checkpointTimes` Map, which preserves insertion order). Because splits are already cumulative from lap start, this equals the elapsed-since-lap-start difference at that checkpoint. It updates on each checkpoint crossing and holds the value until the next crossing. Negative → green (faster), positive → red (slower).

## Question 6: How is the "best lap" chosen, and what does the delta show when there is no usable reference?

### Decision:
**Fastest valid lap; show `+0.000` (neutral color) if none.** Best lap = the completed lap with `valid === true` and the smallest `timeMs`. When no valid lap exists yet, or the best lap has no split recorded for the current checkpoint, the delta line shows `+0.000` in the neutral text color (yellow) rather than green/red. A pure `findBestLap(laps)` helper (and a `computeDelta` helper) will be unit-tested.

## Question 7: How are the four values laid out and labelled?

### Decision:
**Labelled rows: `CUR` / `Δ` / `BEST` / `LAST`.** Four left-aligned rows stacked top-to-bottom, each a short English label plus its formatted value:

```
CUR   1:07.482
Δ    -0.253
BEST  1:06.900
LAST  1:08.010
```

The `Δ` value is color-coded (green/red/neutral per Q5/Q6); the other three use the standard yellow text color. Row height, padding, and font size are chosen so the window fits all four lines.

## Question 8: What is shown in empty/initial states (no lap started yet; no completed lap yet)?

### Decision:
**Fixed layout with placeholders — never blank.** Before the first finish-line crossing (no active lap), `CUR` shows `0:00.000`. `BEST` and `LAST` show `--:--.---` until a valid lap completes. `Δ` shows `+0.000` in neutral color until a best-lap reference exists. The window keeps a constant size/shape from the start; only the values change.

## Question 9: What color palette and font should the applet use?

### Decision:
**Yellow text, bright green/red delta, monospace font.**
- Neutral text (labels, CUR, BEST, LAST, and neutral Δ): yellow `rgba(255,255,0,1)` — matches the other applets.
- Δ faster: green `rgba(0,255,0,1)`; Δ slower: red `rgba(255,0,0,1)`.
- Window background: black `rgba(0,0,0,0.5)` — matches the dashboard.
- Font: a monospace family so digit-width stays constant and the running timer/columns don't jitter frame-to-frame.

## Question 10: How is the background + text rendering structured?

### Decision:
**Single `Canvas` draws both background and text.** One `ScreenElement` with a `Canvas({cache:false, draw})` whose callback fills the translucent black rectangle (`rgba(0,0,0,0.5)`) and then renders all four labelled rows. Self-contained, exact control over window size, and mirrors the acceleration applet's single-canvas approach. Redrawn every frame (which also drives the per-frame current-lap timer).

## Question 11: Which scene(s) should the applet be wired into?

### Decision:
**`PhysicsPlaygroundScene` only** — the production/active scene (`START_SCENE='physics'`). The orphan `PlaygroundScene` is left untouched. The applet is added in `onInitialize`, then `setRaceData(this.raceData, 'Player1')` is called. For the live `timeIntoScene` read, the applet casts `this.scene` to a type exposing `timeIntoScene` (as `CheckpointActor` already casts). Because this adds visible UI, the Playwright baseline must be regenerated (`npm run test:integration-update`) and the new PNGs committed.

## Question 12: What does CUR show when there is no active lap (race finished)?

### Decision:
**Freeze CUR at the last completed lap's time.** When `laps[completedLaps]` is undefined because the race is finished, CUR displays the last completed lap's `timeMs` (frozen). Before the race starts (no lap ever), CUR still shows `0:00.000` (Q8). While a lap is active, CUR runs live as `timeIntoScene − currentLap.currentLapStart`. Note (from the data model): an invalid finish-line crossing does not start a new lap, so the current lap simply keeps counting up.

## Question 13: How much logic is extracted into pure, unit-tested functions?

### Decision:
**Extract helpers only.** Pure functions `formatLapTime(ms)`, `findBestLap(laps)`, and `computeDelta(currentLap, bestLap)` (returning the signed ms delta at the last-passed checkpoint, or a neutral marker when no reference) are extracted and unit-tested (Jest, following the existing `*.actor.test.ts` mock pattern). The view assembly and drawing stay inline in the render method (glue verified visually by the user, per the manual-verification convention). Also add a small sizing sanity test like the other applets.

## Question 14: How are the window dimensions and file layout determined?

### Decision:
**Fixed pixel constants**, in a new `src/ui/laps-applet.actor.ts` (repo convention: `src/ui/*.actor.ts`, kebab-case). Module-level constants (in the style of `PEDALS_*`): `LAPS_APPLET_WIDTH`, row height, padding, and a right/top edge margin. Width is chosen to fit the longest row (e.g. `BEST  1:07.482`) in the monospace font; height = 4 rows × row height + padding. Deterministic and consistent with the existing applets. Tests: `src/ui/laps-applet.actor.test.ts`.

---

## Summary of the design

A new self-contained **`LapsAppletActor`** (`ScreenElement`, `src/ui/laps-applet.actor.ts`):

- **Window**: single `Canvas({cache:false})` draws a black `rgba(0,0,0,0.5)` rectangle of fixed size, then four labelled monospace rows.
- **Position**: top-right; `x = engine.screen.width − LAPS_APPLET_WIDTH − margin` recomputed every frame in `onPreUpdate`; fixed top `y`.
- **Data**: injected via `setRaceData(raceData, playerId)`; live `timeIntoScene` read from the scene each frame.
- **Rows** (yellow `rgba(255,255,0,1)` unless noted):
  - `CUR` — running lap time (`timeIntoScene − currentLap.currentLapStart`); `0:00.000` before start; frozen at last completed time when race finished.
  - `Δ` — `currentLap` split minus `bestLap` split at the last-passed checkpoint; green `rgba(0,255,0,1)` if faster, red `rgba(255,0,0,1)` if slower, `+0.000` neutral yellow if no reference.
  - `BEST` — fastest valid lap's `timeMs`; `--:--.---` until one exists.
  - `LAST` — last completed (valid) lap's `timeMs`; `--:--.---` until one exists.
- **Format**: `M:SS.mmm` via pure `formatLapTime`; delta as `+/-S.mmm`.
- **Pure helpers (unit-tested)**: `formatLapTime`, `findBestLap`, `computeDelta`.
- **Wiring**: added to `PhysicsPlaygroundScene` only; Playwright baseline regenerated.












