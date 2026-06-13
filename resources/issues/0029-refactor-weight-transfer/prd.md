# PRD — Longitudinal acceleration on `VehicleActor`

## Problem Statement

As a player, I want the car's dashboard to reflect what the car is *actually
doing* — how hard it is accelerating or braking — rather than a stand-in value.
Today the G-meter applet (`AccelerationAppletActor`) draws its dot from
`weightTransfer`, which is a smoothed driver-input proxy, not a measured
acceleration. The game has no representation of the vehicle's real acceleration,
so there is nothing truthful to display, log, or build further dynamics on top
of (lateral grip effects, tyre load, force feedback, etc.).

## Solution

Give `VehicleActor` a first-class `acceleration` vector that the dynamics step
fills in every frame:

- `acceleration.y` = current **longitudinal** acceleration (along the direction
  of travel), in px/s², derived from the change in commanded speed between
  consecutive frames.
- `acceleration.x` = current **lateral** acceleration. Held at `0` for now;
  reserved for a later step.

Because the per-frame speed is always a positive magnitude, the previous frame's
speed is remembered in a new `previousSpeed` field and given the correct sign
(negative in reverse) when the delta is computed. This produces a value that is
positive when speeding up forward and negative when braking/decelerating, ready
for a consumer such as the G-meter to read and normalize for display.

## User Stories

1. As a player, I want the car to compute its real longitudinal acceleration each frame, so that the dashboard can later show truthful G-forces instead of a driver-input proxy.
2. As a player driving forward and pressing the throttle, I want the acceleration value to be positive, so that an instrument can show me gaining speed.
3. As a player braking or lifting off, I want the acceleration value to be negative, so that an instrument can show me losing speed.
4. As a player driving in reverse and pressing the throttle, I want the longitudinal acceleration to be signed correctly (pointing rearward), so that the value remains physically meaningful when reversing.
5. As a player coasting at a steady speed, I want the acceleration value to read ~0, so that a steady cruise shows no G-force.
6. As a developer, I want `VehicleActor` to expose an `acceleration: Vector` property, so that any system or UI applet can read the current acceleration from a single, obvious place.
7. As a developer, I want `VehicleActor` to expose a `previousSpeed: number` property, so that the acceleration can be derived from the frame-over-frame speed change.
8. As a developer, I want the longitudinal acceleration expressed in px/s² (frame-rate independent), so that the value is comparable across machines and frame rates and not dependent on the size of the timestep.
9. As a developer, I want the acceleration computed in a dedicated step of `DriveInputSystem` (not buried inside the speed calculation), so that `computeSpeed()` stays a pure scalar producer and the acceleration bookkeeping lives in one named place.
10. As a developer, I want the acceleration derived from the commanded speed scalar (the output of `computeSpeed()`), so that lerp lag and lateral grip effects do not bleed into the longitudinal acceleration figure.
11. As a developer, I want a guard so that a zero (or near-zero) timestep produces an acceleration of 0 instead of Infinity/NaN, so that a paused frame or the first tick cannot poison the value or any consumer.
12. As a developer, I want `previousSpeed` stored as a positive magnitude and signed only at the moment of use, so that the storage convention matches how the engine reports speed and the reverse handling stays explicit.
13. As a developer, I want the lateral component (`acceleration.x`) explicitly held at 0 for now, so that the vector shape is final and consumers can be written against it before lateral physics arrives.
14. As a developer, I want the longitudinal-acceleration math available as a small pure function, so that it can be unit-tested in isolation like the other dynamics helpers.

## Implementation Decisions

- **New state on `VehicleActor`**
  - `acceleration: Vector`, initialized to `vec(0, 0)`. `y` = longitudinal (px/s²), `x` = lateral (px/s², kept 0).
  - `previousSpeed: number`, initialized to `0`. Always stored as a positive magnitude.
- **New step in `DriveInputSystem`** — a dedicated method (e.g. `updateAcceleration`) invoked from `update()` after `computeSpeed()` returns the commanded `speed`, before/independent of `applyKinematics()`. It updates `acceleration.y` and advances `previousSpeed`.
- **Speed source** — the scalar returned by `computeSpeed()` is the "current speed". Comparison is scalar-to-scalar against `previousSpeed`; `vel.magnitude` after kinematics is deliberately *not* used.
- **Sign handling** — both the current speed and the previous speed are signed with the current `isReverse` state at the time of computation:
  - `signedNow = isReverse ? -speed : speed`
  - `signedPrev = isReverse ? -previousSpeed : previousSpeed`
  - `acceleration.y = (signedNow - signedPrev) / dt`
  - then `previousSpeed = speed` (positive magnitude)
- **Orientation** — speeding up forward → `acceleration.y > 0`; braking/decel → `acceleration.y < 0`. No screen-space convention is baked into the physics value; the consuming applet negates it when drawing (as it already does with `weightTransfer`).
- **Units** — px/s² (delta speed divided by `dt = delta / 1000`), frame-rate independent. Normalization for display is the consumer's responsibility.
- **dt guard** — if `dt <= 0`, set `acceleration.y = 0` and still set `previousSpeed = speed`, then return.
- **Vector write strategy** — mutate `acceleration.y` in place (and `.x` is left at its `0` init), avoiding a per-frame `Vector` allocation and preserving the reference for any holder.
- **Deep module (testable):** extract the pure arithmetic into a helper in `math.service.ts` — e.g. `computeLongitudinalAcceleration(speed, previousSpeed, isReverse, dt): number` — that contains the signing, the dt guard, and the division. `updateAcceleration()` then becomes a thin adapter: call the helper, assign `acceleration.y`, advance `previousSpeed`. This mirrors `computeGripFactors`, `smoothPedal`, and `moveToward`, which are pure functions in `math.service.ts` consumed by `DriveInputSystem`.

### Modules touched

- `VehicleActor` — add two data fields; no behavior. (shallow data bag, per ECS convention)
- `DriveInputSystem` — add `updateAcceleration()` orchestration and its call site.
- `math.service.ts` — add `computeLongitudinalAcceleration()` pure function (the deep, testable unit).

## Testing Decisions

- **What makes a good test here:** exercise external behavior (inputs → returned number) of the pure function, not the internals of `DriveInputSystem`. Tests assert the *contract* of `computeLongitudinalAcceleration`, so they survive refactors of how/where it is called.
- **Module under test:** `computeLongitudinalAcceleration()` in `math.service.ts`. Cases to cover:
  - Speeding up forward → positive result; magnitude equals `Δspeed / dt`.
  - Decelerating forward → negative result.
  - Steady speed → 0.
  - Reverse: throttle in reverse (speed magnitude increasing) → negative result; lifting in reverse → positive result.
  - `dt <= 0` → returns 0 (guard), for both forward and reverse.
  - Frame-rate independence: same `Δspeed` over a larger `dt` yields a proportionally smaller result.
- **Prior art:** `src/services/math.service.test.ts` already tests `computeGripFactors`, `moveToward`, `sumClamp`, `smoothPedal` as pure functions with table-style `expect(...).toBe(...)` assertions. New tests follow the same file and style.
- `DriveInputSystem.updateAcceleration` itself is treated as thin glue and is **not** unit-tested directly (no DOM/engine harness exists for systems); its correctness rests on the tested helper plus the existing Playwright integration build. The `AccelerationAppletActor` test stays as-is for this change.

## Out of Scope

- Lateral acceleration: `acceleration.x` stays `0`. No cornering-force model in this change.
- Rewiring `AccelerationAppletActor` (or any other consumer) to read `acceleration` instead of `weightTransfer`. That is the natural next step in issue #29 but is a separate change.
- Any tuning of the existing dynamics (`computeSpeed`, weight transfer, grip) — values and formulas there are untouched.
- Updating Playwright snapshots (no visual change is introduced by this step).

## Further Notes

- Reverse can only be toggled when `vel.magnitude < 1` (`handleReverseToggle`), so `speed` ≈ 0 at the instant `isReverse` flips. Any one-frame sign-flip spike in `acceleration.y` is negligible and intentionally not guarded.
- The acceleration tracks the dynamics model's *commanded* speed, which is intentionally slightly ahead of the lerped actual velocity — this keeps the longitudinal figure clean of lateral grip/lerp artifacts. If a future feature needs true measured G (including cornering scrub), that would be a separate signal derived from `vel`, not a change to this one.
