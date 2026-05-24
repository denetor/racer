# Plan: Steering System — Bicycle Kinematic Model

## Decisions summary

| # | Decision |
|---|----------|
| 1 | Physics logic lives in `VehicleActor.onPostUpdate` |
| 2 | `VehicleActor` exposes `speed: number`; `DriveInputSystem` writes it, `onPostUpdate` reads it |
| 3 | `heading` updated as a Vector via `heading.rotate(Δθ)` |
| 4 | Position updated by Excalibur integrating `vel` (arcade lerp, no explicit rear-axle pivot) |
| 5 | Grip = 1 for v1 — `vel = heading.normalize() * speed`, no slip |
| 6 | `DriveInputSystem` refactored to write only `steeringAngle` and `speed`, not `vel` |
| 7 | Initial `heading` corrected to `vec(0, -1)` (car sprite points up) |

---

## Physics formula

```
L  = |frontAxlePosition| + |rearAxlePosition|   // wheelbase in px (= 63)
Δθ = (speed * tan(steeringAngle) / L) * dt      // heading rotation per frame
```

When `speed = 0`, `Δθ = 0` — the car does not rotate while stationary.

---

## Implementation steps

### Step 1 — Add `speed` field to `VehicleActor`

File: `src/actors/vehicle.actor.ts`

- Add `public speed: number = 0` alongside the other public fields.
- Change initial `heading` from `vec(0.5, 0.4)` to `vec(0, -1)`.

### Step 2 — Implement bicycle model in `VehicleActor.onPostUpdate`

File: `src/actors/vehicle.actor.ts`

Replace the `// TODO update vehicle position and heading` comment with:

```typescript
const dt = elapsed / 1000;
const L = Math.abs(this.frontAxlePosition) + Math.abs(this.rearAxlePosition);
const deltaTheta = (this.speed * Math.tan(this.steeringAngle) / L) * dt;
this.heading = this.heading.rotate(deltaTheta);
this.vel = this.heading.normalize().scale(this.speed);
this.rotateToHeading();
```

Make `rotateToHeading()` callable from `onPostUpdate` (it is already `private`; no visibility change needed since it is called within the same class).

### Step 3 — Refactor `DriveInputSystem`

File: `src/systems/drive-input.system.ts`

- Remove: `const dir = drivable.heading.normalize();` and `drivable.vel = dir.scale(speed);`
- Replace with: `drivable.speed = speed;`

The system no longer writes `vel`. Full responsibility for `vel` and `heading` moves to `onPostUpdate`.

---

## Files changed

| File | Change |
|------|--------|
| `src/actors/vehicle.actor.ts` | Add `speed` field, fix `heading` initial value, implement bicycle model in `onPostUpdate` |
| `src/systems/drive-input.system.ts` | Remove `vel` write, add `speed` write |

---

## Out of scope for v1

- Speed-dependent grip (`vel.lerp`)
- Understeer / oversteer
- Rear-axle pivot for exact position calculation