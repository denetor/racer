export function sumClamp(a: number, b: number, min: number, max: number): number {
    return Math.min(Math.max(a + b, min), max);
}

export function smoothPedal(current: number, pressing: boolean, pressRate: number, releaseRate: number, dt: number): number {
    if (pressing) {
        return Math.min(1, current + pressRate * dt);
    }
    return Math.max(0, current - releaseRate * dt);
}

export function moveToward(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
}

export function computeGripFactors(
    longitudinalLoad: number,
    speedDampening: number,
    strength: number,
    frontGripCap: number
): { frontGrip: number; rearGrip: number } {
    const effectiveLoad = longitudinalLoad * speedDampening;
    const frontGrip = Math.min(Math.max(1 - effectiveLoad * strength, 0), frontGripCap);
    const rearGrip = Math.min(Math.max(1 + effectiveLoad * strength, 0), 1);
    return { frontGrip, rearGrip };
}

/**
 * Normalizes a longitudinal acceleration (px/s²) into a load factor in [-1, 1].
 *
 * Positive when the vehicle is speeding up (load shifts rearward), negative when braking
 * (load shifts forward). The magnitude is scaled by fullScale and clamped, so accelerations
 * beyond the full-scale reference saturate at ±1.
 *
 * @param accelY    longitudinal acceleration in px/s² (signed; negative under braking/reverse)
 * @param fullScale acceleration (px/s²) mapped to a load of ±1
 * @return load factor in [-1, 1]
 */
export function computeLongitudinalLoad(accelY: number, fullScale: number): number {
    return Math.min(Math.max(accelY / fullScale, -1), 1);
}

/**
 * Computes the longitudinal acceleration (px/s²) from the change in speed between frames.
 *
 * Speed is reported as a positive magnitude, so both the current and previous speed are
 * signed by the reverse state before the delta is taken: positive when speeding up forward,
 * negative when braking/decelerating. Guards against a zero/negative timestep by returning 0.
 *
 * @param speed         current commanded speed magnitude (always >= 0)
 * @param previousSpeed previous frame's commanded speed magnitude (always >= 0)
 * @param isReverse     whether reverse gear is engaged
 * @param dt            timestep in seconds
 * @return longitudinal acceleration in px/s² (0 when dt <= 0)
 */
export function computeLongitudinalAcceleration(speed: number, previousSpeed: number, isReverse: boolean, dt: number): number {
    if (dt <= 0) return 0;
    const signedNow = isReverse ? -speed : speed;
    const signedPrev = isReverse ? -previousSpeed : previousSpeed;
    return (signedNow - signedPrev) / dt;
}

export function getHeadingFromRadians(radians: number): { x: number; y: number } {
    return {
        x: Math.sin(radians),
        y: -Math.cos(radians)
    };
}