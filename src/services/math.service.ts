export function sumClamp(a: number, b: number, min: number, max: number): number {
    return Math.min(Math.max(a + b, min), max);
}

export function getHeadingFromRadians(radians: number): { x: number; y: number } {
    return {
        x: Math.sin(radians),
        y: -Math.cos(radians)
    };
}