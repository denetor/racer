# PRD — Acceleration indicator driven by `VehicleActor.acceleration`

> Source decisions: `resources/issues/0029-refactor-weight-transfer/grill-me-out.md` (acceleration-applet grill)

## Problem Statement

As a player, I want the on-screen G-meter to show what the car is *actually*
doing — how hard it's accelerating, braking, and (later) cornering — instead of
a driver-input proxy. The applet currently moves its dot from `weightTransfer`,
a smoothed throttle/brake blend, so it doesn't reflect real acceleration and
only ever moves vertically. Now that `VehicleActor` exposes a real
`acceleration` vector, the indicator should read that. The catch: acceleration
is in px/s² and routinely exceeds any fixed dial size (full braking ≈ -1600,
throttle ≈ +500), so the instrument needs a defined full-scale and over-range
behavior.

## Solution

Rewire the acceleration applet into a true 2D G-meter fed by
`VehicleActor.acceleration`:

- The dot's horizontal position reflects lateral acceleration (`x`) and its
  vertical position reflects longitudinal acceleration (`y`), with "speeding up"
  moving the dot up.
- A fixed full-scale reference maps acceleration to dial radius. Readings beyond
  full-scale pin the dot to the boundary circle along the true acceleration
  direction.
- The old `weightTransfer` data source is removed from the applet (the physics
  model keeps `weightTransfer` for grip — only the indicator changes).

Lateral acceleration is `0` upstream for now, so today the dot only travels
vertically, but the instrument is fully built for the lateral axis.

## User Stories

1. As a player, I want the G-meter dot to reflect real longitudinal acceleration, so that I see how hard the car is actually accelerating or braking.
2. As a player accelerating forward, I want the dot to move up, so that gaining speed reads intuitively as "up" on the dial.
3. As a player braking, I want the dot to move down, so that losing speed reads as "down".
4. As a player, I want a 2D dial where lateral acceleration moves the dot horizontally, so that the instrument is ready to show cornering g without a redesign.
5. As a player coasting at steady speed, I want the dot near the center, so that "no acceleration" reads as neutral.
6. As a player braking very hard, I want the dot to stop at the dial's edge rather than fly outside it, so that the reading stays inside the instrument.
7. As a player, I want the dot constrained to the circular boundary (not the square corners), so that the dial reads consistently in every direction.
8. As a player, I want equal screen distance to mean equal acceleration in any direction, so that the meter is an honest representation of g-force.
9. As a player, I want the dot to respond immediately to acceleration changes, so that the instrument feels live and connected to the car.
10. As a developer, I want the dot-offset math isolated in a pure function, so that it can be unit-tested in isolation like the existing helpers.
11. As a developer, I want the full-scale reference defined as a single tunable constant, so that I can adjust instrument sensitivity in one place.
12. As a developer, I want the applet to stop referencing `weightTransfer`, so that the indicator has a single, truthful data source.
13. As a developer, I want the physics weight-transfer model left intact, so that vehicle handling (understeer/oversteer) is unchanged by this UI work.
14. As a developer, I want the over-range clamping to operate on the acceleration vector's magnitude, so that direction is preserved while the dot is pinned to the edge.

## Implementation Decisions

- **Data source**: the applet reads `VehicleActor.acceleration` (a vector: `x` =
  lateral, `y` = longitudinal) and stops reading `weightTransfer`.
- **2D plot**: `acceleration.x` → horizontal dot offset, `acceleration.y` →
  vertical. Orientation: speeding up (positive `y`) moves the dot up (negative
  canvas-y), matching the prior convention; positive `x` moves it right. `x` is
  `0` upstream for now, so the dot only moves vertically today.
- **Full-scale**: a single, symmetric, fixed display constant (`ACCEL_FULL_SCALE`,
  px/s²) applied to both axes and both signs. Starting value **800 px/s²**,
  tunable. Not derived from vehicle params, not auto-scaled.
- **Over-range clamping**: normalize the acceleration by full-scale, then clamp
  the *vector magnitude* to `1` (× boundary radius). The dot always stays on or
  inside the circular boundary and moves along the true acceleration direction.
  Per-component clamping is explicitly rejected (would allow square corners).
- **No saturation cue**: when pinned at the edge the dot keeps its normal
  styling; no color change.
- **No smoothing**: the applet plots `acceleration` raw each frame (it is no
  longer pre-smoothed the way `weightTransfer` was). Smoothing can be added
  later as an applet-local concern if it looks noisy.
- **Deep module**: the dot-offset computation stays a pure function taking the
  acceleration vector and the boundary radius and returning a `{x, y}` canvas
  offset; it reads the module-level full-scale constant internally and performs
  the normalize + magnitude-clamp + y-negation. The applet's render step is a
  thin caller: read the vehicle's acceleration (default to zero when absent),
  call the function, draw the dot.
- **Removal scope**: `weightTransfer` is removed only from the applet (and its
  test double). `VehicleActor.weightTransfer` and the `DriveInputSystem` grip
  model that consumes it remain untouched.

### Modules touched

- **Acceleration applet** (UI): switches data source, becomes 2D, gains the
  full-scale constant; render step rewired.
- **Dot-offset pure function** (deep, testable unit): new contract — vector +
  radius in, clamped canvas offset out.
- **Applet test double**: updated to expose an `acceleration` vector instead of
  `weightTransfer`.

## Testing Decisions

- **What makes a good test here**: assert the external contract of the pure
  dot-offset function (acceleration vector + radius → canvas offset), not the
  applet's rendering internals. Tests should survive a render refactor.
- **Module under test**: the dot-offset function. Cases:
  - zero acceleration → centered (zero offset)
  - positive `y` (speeding up) at full-scale → dot at top (negative canvas-y of one radius)
  - negative `y` (braking) at full-scale → dot at bottom (positive canvas-y of one radius)
  - intermediate magnitude scales proportionally
  - over-range longitudinal (e.g. 2× full-scale) → clamped to the radius
  - combined `x`+`y` over-range → vector magnitude clamped to the radius (stays inside the circle)
  - positive `x` → dot to the right
- **Prior art**: the existing `calcDotOffset` tests and the `AccelerationAppletActor`
  construction tests in the applet's test file; the pure-function table-style
  assertions in the math-service tests. New tests follow the same patterns; the
  existing `calcDotOffset` tests are rewritten for the new (vector-based) contract.

## Out of Scope

- Producing lateral acceleration upstream — `acceleration.x` stays `0`; the
  applet is merely ready to plot it.
- Removing `weightTransfer` from `VehicleActor` or `DriveInputSystem` — the
  physics handling model keeps it.
- Display smoothing / low-pass filtering of the dot.
- Any over-range visual cue (color change, blink, etc.).
- Re-tuning the vehicle dynamics or the acceleration computation itself.
- Updating Playwright integration snapshots beyond what this visual change
  necessitates.

## Further Notes

- Full-scale of 800 px/s² is a deliberate compromise: throttle (~500) reaches
  ~0.6 of the radius and hard braking (~1600) saturates at the edge. It's a
  single constant, easy to retune once the meter is seen in motion.
- The honesty choice (single symmetric scale) means throttle visibly moves the
  dot less than braking. That asymmetry is real and intended, not a bug.
- Because the displayed value is now raw, expect more liveliness/jitter than the
  old smoothed `weightTransfer` dot; this is acceptable and revisitable.
