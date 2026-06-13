# Plan: Longitudinal acceleration on `VehicleActor`

> Source PRD: `resources/issues/0029-refactor-weight-transfer/prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Key model**: `VehicleActor` gains `acceleration: Vector` (`y` = longitudinal in px/s², `x` = lateral, held at `0`) and `previousSpeed: number` (always stored as a positive magnitude).
- **Deep module**: the arithmetic lives in a pure function `computeLongitudinalAcceleration(speed, previousSpeed, isReverse, dt): number` in `src/services/math.service.ts`, alongside `computeGripFactors` / `smoothPedal` / `moveToward`.
- **Contract of that function**:
  - `signedNow = isReverse ? -speed : speed`
  - `signedPrev = isReverse ? -previousSpeed : previousSpeed`
  - returns `(signedNow - signedPrev) / dt`
  - guard: if `dt <= 0`, returns `0`
- **Orientation**: speeding up forward → positive; braking/decel → negative. No screen-space convention baked in; consumers negate for display.
- **Integration point**: `DriveInputSystem.update()` calls a new thin `updateAcceleration()` step after `computeSpeed()` returns the commanded scalar. Comparison is scalar-to-scalar against the commanded speed — `vel.magnitude` after kinematics is not used.
- **Write strategy**: `updateAcceleration()` mutates `acceleration.y` in place (no per-frame `Vector` allocation) and advances `previousSpeed = speed`.
- **Out of scope for this plan**: lateral physics (`acceleration.x` stays `0`), rewiring `AccelerationAppletActor` off `weightTransfer`, dynamics tuning, Playwright snapshot updates.

---

## Phase 1: Pure longitudinal-acceleration function + unit tests

**User stories**: 8, 11, 12, 14 (underpins 2, 3, 4, 5)

### What to build

Add `computeLongitudinalAcceleration(speed, previousSpeed, isReverse, dt)` to `math.service.ts` implementing the contract above (reverse signing, dt-guard, px/s² division). Cover it with jest tests in `math.service.test.ts` following the existing table-style assertions used for `computeGripFactors`. This phase touches no actor or system code and is fully verifiable on its own via `npm run test:unit`.

### Acceptance criteria

- [ ] `computeLongitudinalAcceleration` exists in `math.service.ts` and is exported.
- [ ] Speeding up forward returns a positive value equal to `Δspeed / dt`.
- [ ] Decelerating forward returns a negative value.
- [ ] Steady speed returns `0`.
- [ ] Reverse with increasing speed magnitude returns a negative value; lifting in reverse returns positive.
- [ ] `dt <= 0` returns `0` (tested forward and reverse).
- [ ] Same `Δspeed` over a larger `dt` yields a proportionally smaller result (frame-rate independence).
- [ ] `npm run test:unit` passes.

---

## Phase 2: Wire acceleration into the vehicle

**User stories**: 1, 2, 3, 4, 5, 6, 7, 9, 10, 13

### What to build

Add the `acceleration: Vector` (init `vec(0, 0)`) and `previousSpeed: number` (init `0`) fields to `VehicleActor`. Add a `updateAcceleration()` method to `DriveInputSystem` that calls the Phase 1 function, mutates `drivable.acceleration.y`, and advances `drivable.previousSpeed = speed`. Invoke it from `update()` after `computeSpeed()` returns the commanded scalar (independent of `applyKinematics()`). `acceleration.x` is left at its `0` init.

### Acceptance criteria

- [ ] `VehicleActor` exposes `acceleration: Vector` and `previousSpeed: number` with the specified initial values.
- [ ] `DriveInputSystem.update()` calls `updateAcceleration()` after `computeSpeed()`, passing the commanded `speed` scalar.
- [ ] At runtime, `acceleration.y` becomes positive under throttle, negative under braking, and ~0 at steady speed; correctly signed in reverse.
- [ ] `acceleration.x` remains `0`.
- [ ] `updateAcceleration()` is a thin adapter — no acceleration arithmetic duplicated outside the Phase 1 function.
- [ ] `computeSpeed()` still returns only a scalar (no acceleration bookkeeping leaked into it).
- [ ] `npm run build` succeeds (tsc + vite).