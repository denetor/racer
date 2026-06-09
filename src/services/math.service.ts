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
    weightTransfer: number,
    speedDampening: number,
    strength: number,
    frontGripCap: number
): { frontGrip: number; rearGrip: number } {
    const effectiveWT = weightTransfer * speedDampening;
    const frontGrip = Math.min(Math.max(1 - effectiveWT * strength, 0), frontGripCap);
    const rearGrip = Math.min(Math.max(1 + effectiveWT * strength, 0), 1);
    return { frontGrip, rearGrip };
}

export function getHeadingFromRadians(radians: number): { x: number; y: number } {
    return {
        x: Math.sin(radians),
        y: -Math.cos(radians)
    };
}