# Grill-me — Drive `AccelerationAppletActor` from `VehicleActor.acceleration`

Goal: make the G-meter applet plot `VehicleActor.acceleration` instead of
`weightTransfer`, and define a full-scale strategy since the new value (px/s²)
can exceed the instrument's size.

Grounding numbers (from `VehicleActor` dynamics):
- full throttle longitudinal accel ≈ `accelerationForce/weight` = **~+500 px/s²**
- full braking ≈ `brakingForce/weight` = **~-1600 px/s²** (grip-scaled)
- coasting friction ≈ **~-800 px/s²**

So the longitudinal value is strongly asymmetric and routinely larger than any
fixed display window — hence the full-scale / clamping decisions below.

---

## Question 1: Which axes should the applet plot from `acceleration`?

### Decision

**Both x and y — a true 2D G-meter.** `acceleration.x` → horizontal dot
offset, `acceleration.y` → vertical. `x` is `0` today so the dot only moves
vertically for now, but the applet is built as a 2D meter and needs no rework
when lateral acceleration ships.

---

## Question 2: How is the full-scale (fondo scala) reference determined?

### Decision

**A fixed display constant** in the applet (e.g. `ACCEL_FULL_SCALE`, in px/s²).
Predictable, decoupled from physics internals. Values beyond it are clamped
(see Q5). Not derived from vehicle params, not dynamically auto-scaled.

---

## Question 3: Single symmetric full-scale, or split (given throttle vs brake asymmetry)?

### Decision

**Single symmetric value**, applied to both axes and both signs. Honest
G-meter: equal screen distance = equal acceleration. Throttle naturally moves
the dot less than braking, which is physically truthful. Simplest to reason
about and tune.

---

## Question 4: What numeric value should the full-scale constant start at?

### Decision

**~800 px/s²** (tunable later). Throttle (~500) reaches ~0.6 of the radius;
hard braking (toward ~1600) saturates and clamps at the edge. Gives good dot
travel for throttle while accepting that heavy braking pegs the dial.

---

## Question 5: How is the dot constrained when acceleration exceeds full-scale?

### Decision

**Clamp the vector magnitude to the boundary radius.** Normalize `(x, y)` by
full-scale; if the resulting magnitude > 1, scale it back to 1 so the dot stays
on/inside the circular boundary while moving along the true acceleration
direction. (Not per-component clamping, which would let the dot reach the square
corners outside the drawn circle.)

---

## Question 6: Visual cue when the dot is pinned (over-range)?

### Decision

**No cue — just pin at the edge.** The dot sits on the boundary when
over-range, same styling as always. Simplest; matches the current yellow dot.
Can revisit if distinguishing "at edge" vs "beyond edge" becomes useful.

---

## Question 7: Smoothing — should the applet smooth the displayed dot?

### Decision

**Display raw.** Plot `acceleration` directly each frame (it is no longer
pre-smoothed the way `weightTransfer` was via `moveToward`). Most truthful and
responsive. If the dot looks noisy in practice, add a low-pass later as an
applet-local concern.

---

## Question 8: New signature for `calcDotOffset` (the pure, tested unit)?

### Decision

**`calcDotOffset(acceleration: {x, y}, boundaryRadius: number) => {x, y}`**,
reading the module-level `ACCEL_FULL_SCALE` constant internally. The function:
normalizes by full-scale, clamps the vector magnitude to 1 (Q5), and returns the
canvas offset with **y negated** (speeding up → dot up, matching today's
`-weightTransfer * radius` convention; `x` positive → dot right). Existing
`calcDotOffset` tests are rewritten for the new contract.

---

## Question 9: Scope of "remove the old weightTransfer references"?

### Decision

**Applet only.** Remove `weightTransfer` from `acceleration-applet.actor.ts`
and its test mock. `VehicleActor.weightTransfer` and the `DriveInputSystem` →
`computeGripFactors` handling model stay untouched — they still drive
understeer/oversteer. Only the G-meter switches its data source to
`acceleration`.

---

## Implementation summary

### `acceleration-applet.actor.ts`

- Add module constant `ACCEL_FULL_SCALE = 800` (px/s²).
- `calcDotOffset(acceleration: {x, y}, boundaryRadius)`:
  - `nx = acceleration.x / ACCEL_FULL_SCALE`, `ny = acceleration.y / ACCEL_FULL_SCALE`
  - `mag = Math.hypot(nx, ny)`; if `mag > 1`, divide `nx, ny` by `mag`
  - return `{ x: nx * boundaryRadius, y: -ny * boundaryRadius }`
- `renderIndicator`: read `this.vehicle?.acceleration ?? {x: 0, y: 0}` and pass
  it to `calcDotOffset`; remove the `weightTransfer` read. Dot styling unchanged.

### `acceleration-applet.actor.test.ts`

- Update the `VehicleActor` mock to expose `acceleration = {x: 0, y: 0}` instead
  of `weightTransfer`.
- Rewrite the `calcDotOffset` tests for the new contract:
  - zero acceleration → `{x: 0, y: 0}`
  - positive y (speeding up) at full-scale → dot up (`y = -boundaryRadius`)
  - negative y (braking) at full-scale → dot down (`y = +boundaryRadius`)
  - intermediate value scales proportionally
  - over-range magnitude (e.g. y = 2 × full-scale) → clamped to the radius
  - combined x+y over-range → magnitude clamped to the radius (stays in circle)
  - positive x → dot right

### Out of scope

- Removing `weightTransfer` from `VehicleActor` / `DriveInputSystem` (physics
  keeps it).
- Lateral acceleration source (`acceleration.x` stays 0 upstream); the applet is
  merely ready for it.
- Any display smoothing / saturation color cue.
