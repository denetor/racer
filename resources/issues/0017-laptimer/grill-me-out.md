# Grill Me — Checkpoint & Race Tracking Design

## Question 1: How should a VehicleActor be identified when it hits a checkpoint?

The `VehicleActor` currently has no `playerId` field. When a `CheckpointActor` collision fires,
`ev.other.owner` gives back the `VehicleActor`, but there's no way to look it up in `RaceData.players`.

**Recommended answer:** Add a `playerId: string` property to `VehicleActor` (e.g. `"Player1"`).
`PlaygroundScene` already does `raceData.addPlayer('Player1', ...)`, so it can also set `player.playerId = 'Player1'`
after creating the actor. This keeps `VehicleActor` lightweight and makes the lookup trivial:
`raceData.players.get(vehicle.playerId)`.

### Decision:
Add `playerId: string` to `VehicleActor`. `PlaygroundScene` sets it after actor creation.

---

## Question 2: How should `CheckpointActor` access `RaceData`?

`CheckpointActor` is instantiated by the Tiled factory (`CheckpointActor.factory`), not directly by `PlaygroundScene`.
It needs to reach `RaceData` to record checkpoint times.

Options:
- **A) Pass `raceData` as a constructor argument** — requires changing the factory signature; `FactoryProps` doesn't carry game-level state natively.
- **B) Store `raceData` as a static/module-level singleton** — simple but couples models to a global.
- **C) Set it as an instance property after the scene adds the actor** — but `CheckpointActor` is created by the Tiled plugin, not by scene code directly.
- **D) Let `CheckpointActor` look up `RaceData` via the scene** — `this.scene` is available inside `onInitialize` and collision handlers; `PlaygroundScene` owns `raceData`, so `(this.scene as PlaygroundScene).raceData` works cleanly.

**Recommended answer:** Option D — access `(this.scene as PlaygroundScene).raceData` inside the collision handler. No extra wiring needed; the scene already owns `raceData`.

### Decision:
Access `RaceData` via `(this.scene as PlaygroundScene).raceData` inside the collision handler.

---

## Question 3: How should the checkpoint order be determined?

`LapTime.checkpointTimes` is `Map<number, number>` (checkpointOrder → timeMs). When a vehicle hits a checkpoint,
we need a numeric order key. The Tiled map has these names: `finish-line`, `checkpoint-1` … `checkpoint-6`.

Options:
- **A) Parse the number from the name** — `"checkpoint-3"` → `3`. `finish-line` gets a special value (e.g. `0`).
- **B) Add a numeric `order` property to each Tiled object** — explicit, but requires editing the map file.
- **C) Use a fixed lookup table** in code — fragile if map changes.

**Recommended answer:** Option A — parse the integer suffix from the name (`parseInt(this.name.split('-').pop())`). `finish-line` is handled separately by name check anyway, so it doesn't need an order key in `checkpointTimes`.

### Decision:
Parse the integer suffix from the checkpoint name. `finish-line` is handled by name check, no order key needed.

---

## Question 4: What time source should be used for checkpoint and lap times?

`LapTime` has `currentLapStart?: number` and `checkpointTimes: Map<number, number>` both storing `timeMs`. We need a consistent time source.

Options:
- **A) `Date.now()`** — wall-clock milliseconds. Simple, always available, but not tied to game time (affected by pauses, tab focus loss, etc.).
- **B) Engine elapsed total time** — `engine.clock.elapsed` or accumulating `elapsed` from `onPostUpdate`. Tied to game time; immune to pauses if the engine pauses too.
- **C) `performance.now()`** — high-resolution wall clock, same caveats as `Date.now()` but more precise.

**Recommended answer:** Option A (`Date.now()`) — for an arcade racer lap timer, wall-clock milliseconds are perfectly adequate and require no engine reference inside the model. The game doesn't appear to support pausing yet.

### Decision:
Use engine elapsed time (`this.scene.engine.clock.elapsed`) — already available via the scene reference from Q2.

---

## Question 5: Where should the checkpoint hit logic live?

`LapTime` has a `// TODO hit checkpoint method` comment. The logic on a hit is:
1. Record `checkpointTimes.set(order, elapsed)`
2. On `finish-line`: check all checkpoints touched → mark lap valid, set `timeMs`, start new lap

Options:
- **A) Logic in `LapTime` model** — `hitCheckpoint(order, elapsed)` and `hitFinishLine(elapsed, totalCheckpoints)`. Models stay self-contained; `CheckpointActor` just calls them.
- **B) Logic in `VehicleRaceData`** — `VehicleRaceData` owns the lap list and manages current-lap state; it delegates to `LapTime` for storage only.
- **C) Logic in `CheckpointActor`** — collision handler does all the work inline; models are pure data bags.

**Recommended answer:** Option B — `VehicleRaceData` is the right owner because it manages the lap list, knows which lap is current, and needs to create the next `LapTime` when a lap completes. `LapTime` stays a simple data holder. `CheckpointActor` calls one method on `VehicleRaceData` and stays thin.

### Decision:
Logic lives in `VehicleRaceData`. It exposes `hitCheckpoint(order, elapsed)` and `hitFinishLine(elapsed)`. `LapTime` is a pure data holder.

---

## Question 6: How should `VehicleRaceData` track the "current lap"?

`VehicleRaceData` has `laps: LapTime[]` and `completedLaps: number`. When a checkpoint is hit, we need to know which `LapTime` to update.

Options:
- **A) Always use `laps[completedLaps]`** — current lap is always `laps[completedLaps]`; completed laps are indices 0…n-1. Simple index arithmetic.
- **B) Add a `currentLap: LapTime` property** — explicit reference, avoids index arithmetic, but requires keeping it in sync with `laps[]`.

**Recommended answer:** Option A — `laps[completedLaps]` is always the current lap. No extra property to maintain. When a lap completes, `completedLaps++` automatically points to the next entry. The first lap is created in the constructor or on first checkpoint hit.

### Decision:
`laps[completedLaps]` is always the current lap. `completedLaps++` on finish advances to the next entry.

---

## Question 7: When is the first `LapTime` created and the lap timer started?

The race has a start/finish line and 6 numbered checkpoints. We need to decide when lap 1 begins.

Options:
- **A) First crossing of `finish-line`** — lap 1 starts the moment the vehicle first crosses the finish line. Before that, no lap is tracked.
- **B) On `RaceData` initialization** — `PlaygroundScene` creates the first `LapTime` when setting up the race, with `currentLapStart` set at that moment.
- **C) On first checkpoint hit (any checkpoint)** — lap starts whenever the vehicle first touches any checkpoint, including the finish line.

**Recommended answer:** Option A — the first `finish-line` crossing starts lap 1 (sets `currentLapStart`) and pushes a fresh `LapTime` into `laps`. This is the standard racing game convention and means the finish line is both the start and end of every lap.

### Decision:
First `finish-line` crossing creates lap 1 and sets `currentLapStart`. The finish line is both start and end of every lap.

---

## Question 8: How many checkpoints must a lap touch to be valid?

The Tiled map has 6 numbered checkpoints (`checkpoint-1` … `checkpoint-6`). `LapTime` already stores `checkpoints: number` (set at construction). When hitting the finish line, we check `checkpointTimes.size === checkpoints`.

The question is: what value is passed as `checkpoints` when constructing a `LapTime`?

Options:
- **A) Hardcode 6** — matches the current map; simple but breaks if the map changes.
- **B) Count checkpoint objects from the scene at runtime** — `this.scene.entities` filtered by tag `'checkpoint'` minus the finish line itself. Dynamic but slightly complex.
- **C) Store the total checkpoint count in `RaceData`** — `PlaygroundScene` counts them once during `onInitialize` and passes the number when creating each `LapTime`.

**Recommended answer:** Option C — `PlaygroundScene` already has access to the Tiled map via `Resources.playgroundMap`. It can count checkpoint objects (excluding `finish-line`) once, store the count in `RaceData`, and pass it when constructing each `LapTime`. Stays dynamic without querying the scene every frame.

### Decision:
`PlaygroundScene.onInitialize` counts checkpoint objects (excluding `finish-line`) from the Tiled map, stores the count in `RaceData.totalCheckpoints`, and passes it when constructing each new `LapTime`.

---

## Question 9: What happens when a vehicle hits a numbered checkpoint it already visited in the current lap?

A vehicle could pass through `checkpoint-3` twice before completing the lap (e.g. cutting back on the track).

Options:
- **A) Ignore duplicate hits** — if `checkpointTimes.has(order)` already, do nothing. First hit counts.
- **B) Overwrite with latest time** — always update; last hit counts.

**Recommended answer:** Option A — ignore duplicates. In a racing game, the first valid pass counts. Overwriting would allow a driver to "refresh" a checkpoint time by re-hitting it, which makes no sense for lap validation.

### Decision:
Ignore duplicate checkpoint hits. First pass counts; subsequent hits are silently skipped.

---

## Question 10: What happens after the last lap is completed?

`RaceData.totalLaps` is 5. When `completedLaps === totalLaps` after a finish-line crossing, the race is over.

Options:
- **A) Set `RaceData.finished = true` and stop tracking** — no new `LapTime` is pushed; `console.log` the final summary. The `hitFinishLine` method checks this flag before starting a new lap.
- **B) Keep going indefinitely** — ignore `totalLaps` for now; just always start a new lap.

**Recommended answer:** Option A — `RaceData.finished = true` and log the summary. The flag already exists on the model. It's only a `console.log` moment for now, but sets up the hook for a future "race over" screen.

### Decision:
Set `RaceData.finished = true` after last lap. Log final summary. No new lap started.

---

## Question 11: What should happen when a vehicle hits a numbered checkpoint before ever crossing the finish line?

Per Q7, lap 1 only starts on the first finish-line crossing. So `laps` is empty at the start. If the vehicle hits `checkpoint-2` before the finish line, there is no current `LapTime` to record into.

Options:
- **A) Silently ignore** — checkpoint hits before the first finish-line crossing are discarded. The vehicle must cross the finish line first to begin a tracked lap.
- **B) Auto-start lap 1 on first checkpoint hit** — any checkpoint (including numbered ones) triggers lap creation.

**Recommended answer:** Option A — silently ignore. This keeps the finish-line-as-start-gate logic clean. In a real race, vehicles line up at the start/finish line before the race begins.

### Decision:
Silently ignore numbered checkpoint hits before the first finish-line crossing.

---

## Question 12: Should `hitFinishLine` handle both "start lap" and "complete lap" in a single method?

Per Q7, the finish line is both the start gate and the finish gate. `VehicleRaceData.hitFinishLine(elapsed)` will be called every time the vehicle crosses it.

The method needs to:
- If `laps` is empty → start lap 1: push a new `LapTime`, set `currentLapStart = elapsed`
- If a lap is in progress → validate (check all checkpoints touched), complete it, log, then start the next one (unless race is over)

**Recommended answer:** Yes — a single `hitFinishLine(elapsed: number)` handles both cases. The branching logic (`laps.length === 0` vs. lap in progress) is internal to the method. `CheckpointActor` just calls it once and doesn't care which case it is. After the call, `CheckpointActor` checks `completedLaps >= raceData.totalLaps` to set `raceData.finished`.

### Decision:
Single `hitFinishLine(elapsed: number)` handles both cases. `CheckpointActor` sets `raceData.finished` after the call if `completedLaps >= totalLaps`.

---

## Summary — Full Design

### Changes by file

**`src/actors/vehicle.actor.ts`**
- Add `playerId: string = ''`

**`src/models/race-data.model.ts`**
- Add `totalCheckpoints: number` (initialized from Tiled map count)

**`src/models/vehicle-race-data.model.ts`**
- Add `hitCheckpoint(order: number, elapsed: number): void`
  - Guard: `laps[completedLaps]` must exist (lap in progress), else ignore
  - Guard: skip if `checkpointTimes.has(order)` (duplicate)
  - Record `checkpointTimes.set(order, elapsed - currentLapStart)`
- Add `hitFinishLine(elapsed: number): void`
  - If `laps` empty → push new `LapTime(1, totalCheckpoints)`, set `currentLapStart = elapsed`, return
  - Else → validate current lap (`checkpointTimes.size === checkpoints`):
    - Valid: set `timeMs = elapsed - currentLapStart`, `valid = true`; `console.log` lap state + all lap times; `completedLaps++`
    - Invalid: `console.log` missing checkpoints warning
  - If `completedLaps < totalLaps` (checked by caller) → caller pushes next `LapTime` and sets `raceData.finished` if done
  - Actually: `hitFinishLine` pushes the *next* `LapTime` itself if race not over; caller only sets `raceData.finished`

**`src/models/lap-time.model.ts`**
- No structural changes needed (pure data holder)

**`src/actors/checkpoint.actor.ts`**
- Collision handler:
  1. Cast `ev.other.owner` to `VehicleActor`
  2. Get `raceData` via `(this.scene as PlaygroundScene).raceData`
  3. Get `vehicleData = raceData.players.get(vehicle.playerId)`; guard if undefined
  4. If `this.name === 'finish-line'` → `vehicleData.hitFinishLine(elapsed)`; then if `vehicleData.completedLaps >= raceData.totalLaps` → `raceData.finished = true`
  5. Else → parse order from name → `vehicleData.hitCheckpoint(order, elapsed)`
  6. `elapsed = this.scene.engine.clock.elapsed`

**`src/scenes/playground.scene.ts`**
- Count checkpoint objects (type `'checkpoint'`, excluding name `'finish-line'`) from `Resources.playgroundMap`; store count in `raceData.totalCheckpoints`
- Set `player.playerId = 'Player1'` after creating the actor

