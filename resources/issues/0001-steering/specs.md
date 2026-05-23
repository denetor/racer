# Steering system

We need to store, in the `VehicleActor` the degree of the steering wheels.

The steering happens on the `DriveInputSystem`: when pressed `Keybindings.SteerLeft` or `Keybindings.SteerRight` the 
steering angle moves toward the requested direction.

When no steering input is applied, the steering returns towards 0 (no steering).

## Easing functions

The amount of both steering and return are not linear with the time pressed, but are eased to slow both the initial 
and final phase.

The easing function to use is the following, that returns a value between 0 and 1, given a 0..1 input.
```typescript
function easeInOutQuad(x: number): number {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
```

## Constants

`VehicleActor` should define the following constants:

- frontAxleOffset: the distance, in pixels, between the center of the actor and the front axle. This will be useful to 
determine the axles distance and to draw the wheels indicators (not in the scope of this document).
- maxSteeringAngle: maximum steering angle