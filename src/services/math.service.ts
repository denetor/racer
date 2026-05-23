export class MathService {


    /**
     * Computes the sum of two numbers and clamps the result within a specified range.
     *
     * @param {number} a - The first number to add.
     * @param {number} b - The second number to add.
     * @param {number} min - The lower limit to clamp the result.
     * @param {number} max - The upper limit to clamp the result.
     * @return {number} The clamped sum of the two numbers.
     */
    static sumClamp(a: number, b: number, min: number, max: number): number {
        let sum = a + b;
        if (sum > max) return max;
        if (sum < min) return min;
        return sum;
    }
}