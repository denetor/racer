# PRD: AccelerationAppletActor

## Problem Statement

The driving dashboard currently shows only pedal inputs (throttle and brake bars). The player has no real-time visual feedback on longitudinal weight transfer — a key physics value that affects front/rear grip balance. Without this indicator, it is difficult to understand or improve driving technique (e.g. trail-braking, smooth throttle application).

## Solution

Add a new child actor `AccelerationAppletActor` to `DrivingDashboardActor`, positioned as the second applet from the left. The applet displays a G-meter style indicator: a yellow filled circle that moves vertically in real time to reflect the vehicle's `weightTransfer` value. A boundary circle shows the maximum displacement area. The design is intentionally 2D-ready so that lateral acceleration can be added later as a horizontal axis with no structural changes.

## User Stories

1. As a player, I want to see a real-time indicator of longitudinal weight transfer on the dashboard, so that I can understand how my throttle and brake inputs affect the car's balance.
2. As a player, I want the indicator to be centered when the car is coasting (weightTransfer = 0), so that the neutral state is visually clear.
3. As a player, I want the dot to move upward when I accelerate (weightTransfer > 0), so that I can see weight shifting to the rear axle.
4. As a player, I want the dot to move downward when I brake (weightTransfer < 0), so that I can see weight shifting to the front axle.
5. As a player, I want the dot to reach the boundary circle edge at maximum weight transfer (±1), so that I can read the full dynamic range at a glance.
6. As a player, I want a boundary circle outline to show the maximum area the dot can reach, so that I always understand the scale of the display.
7. As a player, I want the applet to be visually consistent with the pedals applet (yellow palette, same size, same margin), so that the dashboard feels cohesive.
8. As a player, I want the applet to be square, so that when lateral acceleration is added it displays symmetrically on both axes.
9. As a developer, I want the dot offset calculation to be a pure exported function, so that it can be unit-tested independently of the rendering lifecycle.
10. As a developer, I want the applet to follow the same `setVehicle` / `ScreenElement` / `Canvas` pattern as `PedalsAppletActor`, so that the dashboard wiring is uniform and predictable.
11. As a developer, I want the applet to be in its own file, so that it can be extended with lateral acceleration without touching the pedals applet.

## Implementation Decisions

### Modules to build or modify

**New: `AccelerationAppletActor`**
- Extends `ScreenElement`, same as `PedalsAppletActor`.
- Size: `appletSize = DrivingDashboardActor.HEIGHT - PEDALS_MARGIN * 2` (currently 48×48 px).
- Position within parent: `x = PEDALS_MARGIN + appletSize + PEDALS_MARGIN`, `y = PEDALS_MARGIN` (second applet slot, gap = `PEDALS_MARGIN`).
- Uses `Canvas({ cache: false })` with a draw callback re-executed each frame.
- Exposes `setVehicle(vehicle: VehicleActor): void` to receive the vehicle reference.
- Imports `PEDALS_MARGIN` from the pedals applet module to avoid duplication.

**New: `calcDotOffset` pure function (exported from the same file)**
- Signature: `calcDotOffset(weightTransfer: number, boundaryRadius: number): { x: number, y: number }`
- Current implementation: `{ x: 0, y: -weightTransfer * boundaryRadius }`.
- Y is negated because canvas Y increases downward; `weightTransfer > 0` must move the dot up on screen.
- Future extension: add `lateralAcceleration` parameter and set `x = lateralAcceleration * boundaryRadius`.

**Modified: `DrivingDashboardActor`**
- Instantiates `AccelerationAppletActor` in `onInitialize` and adds it as a child.
- Forwards `setVehicle` calls to the new applet, same pattern as `pedalsApplet`.

### Visual design constants

| Element | Value |
|---|---|
| Applet size | `DrivingDashboardActor.HEIGHT − PEDALS_MARGIN × 2 = 48 px` |
| Applet x position | `PEDALS_MARGIN + appletSize + PEDALS_MARGIN = 64 px` |
| Applet y position | `PEDALS_MARGIN = 8 px` |
| Boundary circle radius | `appletSize / 2 − 4 = 20 px` |
| Dot radius | `6 px` |
| Boundary stroke color | `rgba(255, 255, 0, 0.35)` |
| Dot fill color | `rgba(255, 255, 0, 1)` |
| Dot center at rest | `(appletSize / 2, appletSize / 2)` |

### Data source

- `VehicleActor.weightTransfer` — range `[−1, 1]`, updated each frame by `DriveInputSystem`.
- No new fields or systems are required.

## Testing Decisions

**What makes a good test here:** test only the exported pure function and constructor-observable state (size, position). Do not test canvas drawing calls or internal render details.

**Modules to test:**

1. `calcDotOffset` — unit test all meaningful input cases:
   - `weightTransfer = 0` → `{ x: 0, y: 0 }` (dot at center)
   - `weightTransfer = 1` → `{ x: 0, y: -boundaryRadius }` (dot at top edge)
   - `weightTransfer = -1` → `{ x: 0, y: boundaryRadius }` (dot at bottom edge)
   - `weightTransfer = 0.5` → `{ x: 0, y: -boundaryRadius * 0.5 }` (intermediate)

2. `AccelerationAppletActor` constructor — verify:
   - `width` and `height` equal `appletSize`
   - `setVehicle` does not throw

**Prior art:** `src/ui/pedals-applet.actor.test.ts` — same mock structure for `excalibur`, `VehicleActor`, and `DrivingDashboardActor`. Follow it exactly.

## Out of Scope

- Lateral acceleration display (X axis movement of the dot) — deferred to a future issue.
- Any changes to `VehicleActor` physics or `weightTransfer` calculation.
- Historical trace or trail effect on the dot.
- Color coding (e.g. red when near maximum).
- Scaling or responsive sizing based on viewport.

## Further Notes

- The `calcDotOffset` signature is intentionally minimal now. When lateral acceleration is introduced, the function signature will be extended to `calcDotOffset(weightTransfer, lateralAcceleration, boundaryRadius)`. No other structural changes to the applet will be needed.
- The boundary circle outline uses the same dim-yellow stroke as `PedalsAppletActor` track outlines (`rgba(255, 255, 0, 0.35)`), preserving the dashboard's visual language.
- `PEDALS_MARGIN` is shared between both applets — it acts as the universal spacing unit for the dashboard. It should not be redefined in the new file.