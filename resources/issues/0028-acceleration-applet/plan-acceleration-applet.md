# Plan: AccelerationAppletActor

> Source PRD: resources/issues/0028-acceleration-applet/prd.md

## Architectural decisions

- **Actor pattern**: `ScreenElement` subclass with `Canvas({ cache: false })` draw callback — same as `PedalsAppletActor`
- **Sizing**: `appletSize = DrivingDashboardActor.HEIGHT - PEDALS_MARGIN * 2 = 48px`
- **Position**: second slot from left — `x = PEDALS_MARGIN + appletSize + PEDALS_MARGIN = 64`, `y = PEDALS_MARGIN = 8`
- **Shared spacing constant**: `PEDALS_MARGIN` imported from `pedals-applet.actor`, not redefined
- **Pure helper**: `calcDotOffset(weightTransfer, boundaryRadius): { x, y }` exported for unit testing; future 2D extension adds `lateralAcceleration` parameter only
- **Visual constants**: boundary radius `appletSize/2 - 4 = 20px`, dot radius `6px`, colors match `PedalsAppletActor` (`rgba(255,255,0,1)` fill, `rgba(255,255,0,0.35)` stroke)

---

## Phase 1: Static applet wired into dashboard

**User stories**: 2, 6, 7, 8, 9, 10, 11

### What to build

Create `AccelerationAppletActor` as a `ScreenElement` that renders a boundary circle (dim yellow outline) and a yellow filled dot at the center of the applet. The applet is square (48×48), positioned as the second child of `DrivingDashboardActor`. Export `calcDotOffset` as a pure function. Add the applet to `DrivingDashboardActor` in `onInitialize` and forward `setVehicle` calls — vehicle connection is wired but the dot stays centered because live data is not consumed yet. Write unit tests for `calcDotOffset` and the actor constructor.

### Acceptance criteria

- [ ] `calcDotOffset(0, 20)` returns `{ x: 0, y: 0 }`
- [ ] `calcDotOffset(1, 20)` returns `{ x: 0, y: -20 }`
- [ ] `calcDotOffset(-1, 20)` returns `{ x: 0, y: 20 }`
- [ ] `calcDotOffset(0.5, 20)` returns `{ x: 0, y: -10 }`
- [ ] `AccelerationAppletActor` constructor produces width and height equal to `appletSize`
- [ ] `setVehicle` does not throw
- [ ] `DrivingDashboardActor` adds the applet as a child during `onInitialize`
- [ ] Dashboard renders boundary circle outline and centered dot visible on screen

---

## Phase 2: Live weightTransfer display

**User stories**: 1, 3, 4, 5

### What to build

Connect the vehicle reference inside `AccelerationAppletActor` so the `Canvas` draw callback reads `vehicle.weightTransfer` each frame. Use `calcDotOffset` to compute the dot position relative to the applet center. The dot moves up when `weightTransfer > 0`, down when `weightTransfer < 0`, and reaches the boundary circle edge at `±1`.

### Acceptance criteria

- [ ] Dot is at center when vehicle is coasting (`weightTransfer ≈ 0`)
- [ ] Dot moves toward the top of the boundary circle when accelerating (`weightTransfer → 1`)
- [ ] Dot moves toward the bottom of the boundary circle when braking (`weightTransfer → -1`)
- [ ] Dot center touches the boundary circle edge at `weightTransfer = ±1`
- [ ] Dot position updates smoothly each frame without flickering
- [ ] No vehicle reference (`null`) renders dot at center without error