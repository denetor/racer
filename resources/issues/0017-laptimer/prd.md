# PRD — Checkpoint & Lap Timing System

## Problem Statement

The game has vehicles racing on a track with checkpoint actors placed in the Tiled map, but crossing a checkpoint currently does nothing beyond a `console.log`. There is no mechanism to:
- identify which vehicle crossed a checkpoint
- record when each checkpoint was crossed during a lap
- validate that a lap is complete (all checkpoints touched before the finish line)
- track completed laps and their times per vehicle
- detect when the race is over

As a result, the race data models (`RaceData`, `VehicleRaceData`, `LapTime`) exist but are entirely unused.

## Solution

Wire up the existing race data models to the checkpoint collision system. Each `CheckpointActor` collision routes to `VehicleRaceData`, which owns the lap tracking logic. The finish line acts as both the start gate and the end gate for every lap. A lap is only valid when all numbered checkpoints have been crossed before the finish line. Completed lap state and cumulative lap times are logged to the console.

## User Stories

1. As a vehicle, I want my `playerId` to be carried on the actor, so that the checkpoint system can look up my race data when I collide with a checkpoint.
2. As the race system, I want to identify which vehicle actor crossed a checkpoint, so that each vehicle's lap data is updated independently.
3. As the lap timer, I want the first finish-line crossing to start lap 1, so that timing begins from a well-defined starting gate.
4. As the lap timer, I want the engine's elapsed game time to be used for all timestamps, so that lap times are immune to wall-clock drift and tab focus loss.
5. As the lap timer, I want each numbered checkpoint crossing to record the elapsed time at that moment in the current `LapTime`, so that sector times are available for review.
6. As the lap validator, I want duplicate checkpoint hits within the same lap to be silently ignored, so that a vehicle cannot improve its checkpoint record by revisiting a gate.
7. As the lap validator, I want numbered checkpoint hits before the first finish-line crossing to be silently ignored, so that pre-race movement does not corrupt lap data.
8. As the lap validator, I want the finish-line crossing to check whether all numbered checkpoints were touched in the current lap, so that invalid laps (shortcutting) are detected.
9. As the lap validator, I want a `console.log` warning when the finish line is crossed without all checkpoints having been touched, so that invalid lap attempts are visible during development.
10. As the lap tracker, I want a completed valid lap to set `LapTime.valid = true` and record `LapTime.timeMs`, so that the lap time is persisted on the model.
11. As the lap tracker, I want a completed lap to immediately start the next lap's `LapTime`, so that timing for the following lap begins right away.
12. As the race monitor, I want the completed lap's full state to be printed to `console.log` at the end of each lap, so that lap data is inspectable without a UI.
13. As the race monitor, I want all lap times accumulated by a vehicle to be printed to `console.log` at the end of each lap, so that progress over the race can be reviewed.
14. As the race system, I want `RaceData.finished` to be set to `true` once the vehicle completes the final lap, so that downstream systems (future race-over screen) have a clear signal.
15. As the scene setup, I want the total number of numbered checkpoints to be counted once from the Tiled map at initialization, so that lap validation is always in sync with the actual map layout without hardcoded values.
16. As the scene setup, I want each vehicle actor's `playerId` to be set when the actor is added to the scene, so that the checkpoint-to-race-data lookup works correctly from the first collision.

## Implementation Decisions

### Modules modified

**`VehicleActor`**
- Add a `playerId: string` property (default empty string).
- The scene sets this immediately after creating the actor.

**`RaceData`**
- Add a `totalCheckpoints: number` property.
- Populated in `PlaygroundScene.onInitialize` by counting Tiled objects of class `checkpoint` whose name is not `finish-line`.

**`VehicleRaceData`**
- Add `hitCheckpoint(order: number, elapsed: number): void`
  - No-op if no lap is in progress (`laps[completedLaps]` is undefined).
  - No-op if the checkpoint was already recorded this lap (first hit wins).
  - Records `checkpointTimes.set(order, elapsed - currentLapStart)`.
- Add `hitFinishLine(elapsed: number, totalCheckpoints: number): void`
  - If `laps` is empty: push a new `LapTime(1, totalCheckpoints)` and set `currentLapStart = elapsed`. Return.
  - If a lap is in progress and all checkpoints were touched (`checkpointTimes.size === checkpoints`): mark lap valid (`valid = true`, `timeMs = elapsed - currentLapStart`), `console.log` lap state and all lap times, increment `completedLaps`, push next `LapTime` (caller decides whether to do this based on race state).
  - If a lap is in progress but not all checkpoints were touched: `console.log` a warning with the missing checkpoint count.
- The method does not set `RaceData.finished`; that responsibility stays with `CheckpointActor`.

**`LapTime`**
- No logic changes. Remains a pure data holder.
- Remove the TODO comment for `hitCheckpoint`.

**`CheckpointActor`** (collision handler)
- Cast the colliding entity to `VehicleActor`.
- Retrieve `raceData` via `(this.scene as PlaygroundScene).raceData`.
- Look up `VehicleRaceData` by `vehicle.playerId`; guard against missing entries.
- Read `elapsed = this.scene.engine.clock.elapsed`.
- If `this.name === 'finish-line'`: call `vehicleData.hitFinishLine(elapsed, raceData.totalCheckpoints)`; if `vehicleData.completedLaps >= raceData.totalLaps`, set `raceData.finished = true`.
- Otherwise: parse the numeric suffix from `this.name` and call `vehicleData.hitCheckpoint(order, elapsed)`.

**`PlaygroundScene`**
- After creating the player actor, set `player.playerId = 'Player1'`.
- Count checkpoint objects (class `checkpoint`, name ≠ `finish-line`) from the Tiled resource; store in `raceData.totalCheckpoints`.

### Key invariants

- `laps[completedLaps]` is always the current in-progress lap; indices `0…completedLaps-1` are completed laps.
- The finish line is the sole trigger for both starting and ending a lap.
- Checkpoint order is derived by parsing the integer suffix from the Tiled object name (e.g. `checkpoint-3` → `3`).
- All timestamps use `engine.clock.elapsed` (ms since engine start), so lap times are deltas: `elapsed - currentLapStart`.

## Testing Decisions

### What makes a good test here

Test the observable behavior of `VehicleRaceData` in isolation: given a sequence of method calls with specific elapsed values, assert the resulting state of `laps`, `completedLaps`, `checkpointTimes`, `timeMs`, and `valid`. Do not test internal branching directly; test outcomes only.

### Modules to unit-test

**`VehicleRaceData`** — this is the deepest new module and the most testable in isolation (pure TypeScript class, no Excalibur dependency):
- Checkpoint hit before finish line → no lap created, `laps` stays empty.
- First finish-line hit → lap 1 created, `currentLapStart` set.
- Checkpoint hit during lap → recorded in `checkpointTimes`.
- Duplicate checkpoint hit → second hit ignored.
- Finish-line hit with incomplete checkpoints → lap not validated, `valid` remains false.
- Finish-line hit with all checkpoints touched → lap marked valid, `timeMs` computed correctly, `completedLaps` incremented.
- Correct lap time calculation: `timeMs = finishElapsed - startElapsed`.

**`LapTime`** — no logic to test (pure data holder).

### Prior art

No unit tests exist in this project yet. Unit tests should follow Jest conventions (`*.test.ts`) and be placed alongside the model files in `src/models/`. Integration tests remain Playwright screenshot comparisons in `tests/`.

## Out of Scope

- UI display of lap times (HUD, on-screen timer).
- Multiple simultaneous players (infrastructure is designed for it, but only `Player1` is wired up).
- Race start/countdown sequence.
- Invalid lap penalties beyond the `console.log` warning.
- Pause-aware timing (engine pause support does not exist yet).
- Persisting race results beyond the current session.

## Further Notes

- The Tiled map currently defines `finish-line` plus `checkpoint-1` through `checkpoint-6` (6 checkpoints total). The dynamic count in `PlaygroundScene` means this number can change by editing the map alone.
- `RaceData.started` exists on the model but is not set by this feature; it could be set on the first finish-line crossing in a future iteration.
- The `console.log` output for completed laps serves as the only observability mechanism for now and is intentionally temporary.
