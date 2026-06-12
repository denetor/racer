# Grill-me: AccelerationAppletActor

## Question 1: Gap between applets

`PedalsAppletActor` sits at `x = PEDALS_MARGIN = 8`, width `= 48`.
Should there be a visual gap between the two applets, and if so how wide?

- Option A — No gap: second applet starts at `x = 8 + 48 = 56`
- Option B — Gap equal to `PEDALS_MARGIN (8px)`: second applet starts at `x = 8 + 48 + 8 = 64`
- Option C — Custom gap value

### Decision:
**Option B** — gap of `PEDALS_MARGIN (8px)`.
`AccelerationAppletActor` x position: `PEDALS_MARGIN + appletSize + PEDALS_MARGIN = 64`.
y position: `PEDALS_MARGIN = 8` (same as `PedalsAppletActor`).

---

## Question 2: Indicator displacement range

When `weightTransfer = ±1` (maximum), does the yellow dot reach the edge of the boundary circle,
or does it stop at some fraction of the radius?

- Option A — Dot center reaches the boundary circle edge at `±1`
- Option B — Dot center stops at `boundaryRadius - dotRadius` (dot edge stays inside circle)
- Option C — Dot center stops at a fixed fraction of the boundary radius

### Decision:
**Option A** — dot center reaches the boundary circle edge at `weightTransfer = ±1`.
Displacement formula: `offset = weightTransfer * boundaryRadius`.

---

## Question 3: Boundary circle radius and dot radius

Applet size is `48×48`, center at `(24, 24)`.

### Decision:
- **Boundary circle radius**: `appletSize / 2 - 4 = 20px` (small margin from applet edge)
- **Dot radius**: `6px`
- Boundary circle: no fill, stroke `rgba(255, 255, 0, 0.35)` (same as `PedalsAppletActor` track outlines)
- Dot fill: `rgba(255, 255, 0, 1)` (same as `PedalsAppletActor` filled bars)

---

## Question 4: Future lateral acceleration — direction convention

When lateral acceleration is added as the X axis, which direction does positive lateral acceleration move the dot?

- Option A — Positive = right (natural screen-coordinate convention)
- Option B — Positive = left

### Decision:
**Option A** — positive lateral acceleration moves the dot **right**.
Full 2D offset: `{ x: lateralAcceleration * boundaryRadius, y: -weightTransfer * boundaryRadius }`.
(Note: y is negated because canvas y increases downward; `weightTransfer > 0` → dot moves up on screen.)

---

## Question 5: Exported pure helper for testability

Should `AccelerationAppletActor` export a pure helper function for unit testing, mirroring `calcBarHeight` from `PedalsAppletActor`?

- Option A — Yes, export `calcDotOffset(weightTransfer, boundaryRadius): { x, y }`
- Option B — Keep math inline inside `renderIndicator`

### Decision:
**Option A** — export `calcDotOffset(weightTransfer: number, boundaryRadius: number): { x: number, y: number }`.
- For now: `{ x: 0, y: -weightTransfer * boundaryRadius }`
- Future-ready: caller passes both `weightTransfer` and `lateralAcceleration` once available.

---

## Summary of all design constants

| Constant | Value | Source |
|---|---|---|
| `appletSize` | `DrivingDashboardActor.HEIGHT - PEDALS_MARGIN * 2 = 48` | Derived |
| `x` position | `PEDALS_MARGIN + appletSize + PEDALS_MARGIN = 64` | Decision 1 |
| `y` position | `PEDALS_MARGIN = 8` | From `PedalsAppletActor` pattern |
| Boundary radius | `appletSize / 2 - 4 = 20` | Decision 3 |
| Dot radius | `6` | Decision 3 |
| Boundary stroke | `rgba(255, 255, 0, 0.35)` | Decision 3 |
| Dot fill | `rgba(255, 255, 0, 1)` | Decision 3 |
| Dot center at `wT=0` | `(appletSize/2, appletSize/2) = (24, 24)` | Spec |
| Dot Y offset | `-weightTransfer * boundaryRadius` | Decision 2 + 4 |
| Dot X offset (future) | `lateralAcceleration * boundaryRadius` | Decision 4 |

## Implementation notes

- `AccelerationAppletActor extends ScreenElement` (same as `PedalsAppletActor`)
- Uses `Canvas({ cache: false })` with a `draw` callback, re-rendered each frame
- `setVehicle(vehicle: VehicleActor)` method to receive vehicle reference
- Imports `PEDALS_MARGIN` from `@/ui/pedals-applet.actor`
- File: `src/ui/acceleration-applet.actor.ts`
- `DrivingDashboardActor` adds it as a child in `onInitialize` and forwards `setVehicle` calls, same pattern as `pedalsApplet`