# Plan: Checkpoint & Lap Timing System

> Source PRD: `resources/issues/0017-laptimer/prd.md`

## Architectural decisions

- **Key models**: `VehicleActor`, `RaceData`, `VehicleRaceData`, `LapTime`
- **Current lap index**: `laps[completedLaps]` is always the in-progress lap; `0…completedLaps-1` are completed
- **Time source**: `engine.clock.elapsed` (ms since engine start); lap times are deltas (`elapsed - currentLapStart`)
- **Checkpoint order**: parsed from Tiled object name suffix (e.g. `checkpoint-3` → `3`); `finish-line` identified by exact name match
- **Finish line role**: sole trigger for both starting and ending a lap
- **Vehicle identity**: `playerId: string` on `VehicleActor`; `CheckpointActor` uses it to look up `VehicleRaceData` from `RaceData.players`
- **RaceData access**: `CheckpointActor` reads `(this.scene as PlaygroundScene).raceData` at collision time
- **Checkpoint count**: counted once in `PlaygroundScene.onInitialize` from Tiled objects (class `checkpoint`, name ≠ `finish-line`); stored as `RaceData.totalCheckpoints`

---

## Phase 1: Identity & data model wiring

**User stories**: 1, 2, 15, 16

### What to build

Add a `playerId` property to `VehicleActor` so that any collision handler can identify the vehicle and look up its race data. Add a `totalCheckpoints` property to `RaceData`. In `PlaygroundScene.onInitialize`, count the numbered checkpoint objects from the Tiled map (excluding `finish-line`) and store the result in `raceData.totalCheckpoints`. Set `player.playerId` to `'Player1'` immediately after creating the actor, matching the key already used in `raceData.addPlayer`.

This phase delivers no runtime behavior change — it is pure plumbing. The smoke test is that the game still runs and no TypeScript errors are introduced.

### Acceptance criteria

- [ ] `VehicleActor` has a `playerId: string` property defaulting to `''`
- [ ] `RaceData` has a `totalCheckpoints: number` property
- [ ] `PlaygroundScene` sets `player.playerId = 'Player1'` after creating the actor
- [ ] `PlaygroundScene` counts Tiled checkpoint objects (class `checkpoint`, name ≠ `finish-line`) and stores the result in `raceData.totalCheckpoints`
- [ ] `raceData.totalCheckpoints` equals `6` at runtime for the current map
- [ ] Game runs without errors

---

## Phase 2: Checkpoint time recording

**User stories**: 4, 5, 6, 7

### What to build

Add `hitCheckpoint(order: number, elapsed: number): void` to `VehicleRaceData`. The method records `elapsed - currentLapStart` into `checkpointTimes` for the given order key. It is a no-op if no lap is in progress (`laps[completedLaps]` is undefined — i.e. the finish line has never been crossed) or if the checkpoint was already recorded this lap.

Wire `CheckpointActor`'s collision handler to route numbered checkpoint hits: cast the colliding entity to `VehicleActor`, retrieve `raceData` via the scene, look up `VehicleRaceData` by `vehicle.playerId`, read `elapsed` from `engine.clock.elapsed`, parse the numeric suffix from `this.name`, and call `hitCheckpoint`.

Verifiable by console-logging `checkpointTimes` after a hit and confirming the delta is reasonable.

### Acceptance criteria

- [ ] `VehicleRaceData.hitCheckpoint` exists and records the time delta into `LapTime.checkpointTimes`
- [ ] Hitting a checkpoint before the first finish-line crossing leaves `laps` empty (no-op)
- [ ] Hitting a checkpoint a second time within the same lap does not overwrite the first recorded time
- [ ] `CheckpointActor` collision handler routes numbered checkpoints to `hitCheckpoint`
- [ ] `CheckpointActor` guards against a missing `VehicleRaceData` entry (unknown `playerId`)

---

## Phase 3: Lap lifecycle

**User stories**: 3, 8, 9, 10, 11, 12, 13

### What to build

Add `hitFinishLine(elapsed: number, totalCheckpoints: number): void` to `VehicleRaceData`. The method has two branches:

- **No lap in progress** (`laps` is empty): push a new `LapTime` for lap 1, set `currentLapStart = elapsed`. This is the start gate.
- **Lap in progress**: check if all checkpoints were touched (`checkpointTimes.size === checkpoints`).
  - All touched: mark `valid = true`, compute `timeMs = elapsed - currentLapStart`, `console.log` the completed lap state and all lap times for this vehicle, increment `completedLaps`, push the next `LapTime` (lap number = `completedLaps + 1`), set its `currentLapStart = elapsed`.
  - Not all touched: `console.log` a warning naming how many checkpoints are missing.

Wire `CheckpointActor` to route `finish-line` hits to `hitFinishLine`, passing `raceData.totalCheckpoints`.

Verifiable end-to-end: drive through all 6 checkpoints then cross the finish line → console shows lap time and `valid: true`.

### Acceptance criteria

- [ ] First finish-line crossing pushes `laps[0]` and sets `currentLapStart`
- [ ] Finish-line crossing with all checkpoints touched marks the lap `valid`, sets `timeMs`, and starts the next lap
- [ ] Finish-line crossing with missing checkpoints logs a warning and does not validate the lap
- [ ] `completedLaps` increments by 1 after each valid lap completion
- [ ] `console.log` on lap completion shows the completed `LapTime` state
- [ ] `console.log` on lap completion shows all lap times recorded so far for that vehicle
- [ ] Next lap's `LapTime` is pushed immediately with `currentLapStart = elapsed`
- [ ] `CheckpointActor` routes finish-line collisions to `hitFinishLine`

---

## Phase 4: Race completion

**User stories**: 14

### What to build

After calling `hitFinishLine` in `CheckpointActor`, check whether `vehicleData.completedLaps >= raceData.totalLaps`. If so, set `raceData.finished = true`. The `hitFinishLine` method itself does not start a new lap when the race is already over — guard the "push next lap" step with this check.

Verifiable: after 5 valid laps, `raceData.finished` is `true` and no 6th `LapTime` is pushed.

### Acceptance criteria

- [ ] After the final lap is completed, `raceData.finished` is set to `true`
- [ ] No new `LapTime` is pushed after the final lap
- [ ] `CheckpointActor` sets `raceData.finished` (not `VehicleRaceData`)
- [ ] Laps beyond `totalLaps` cannot be started (finish-line crossing after race end is a no-op)

---

## Phase 5: Unit tests for `VehicleRaceData`

**User stories**: all (validation of the core logic layer)

### What to build

Create the first Jest unit test file in the project, placed alongside the model. Test `VehicleRaceData` in isolation — no Excalibur dependency, no scene. Drive it with sequences of method calls and assert resulting model state.

Scenarios to cover:
1. Checkpoint hit before any finish-line crossing → `laps` stays empty
2. First finish-line crossing → `laps[0]` created, `currentLapStart` set
3. Checkpoint hit during lap → recorded in `checkpointTimes` with correct delta
4. Duplicate checkpoint hit → `checkpointTimes` unchanged after second hit
5. Finish-line crossing with incomplete checkpoints → `valid` remains false, `completedLaps` unchanged
6. Finish-line crossing with all checkpoints touched → `valid = true`, `timeMs` correct, `completedLaps = 1`
7. Correct lap time delta: `timeMs = finishElapsed - startElapsed`

### Acceptance criteria

- [ ] Jest test file exists for `VehicleRaceData`
- [ ] All 7 scenarios above have passing tests
- [ ] Tests assert on model state only (no mocking of internal methods)
- [ ] `npm run test:unit` passes with no failures
