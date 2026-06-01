export type GridPositionArgs = {
    /**
     * Position in grid: 1=pole position, ...
     */
    position?: number;
    /**
     * x position in map
     */
    x?: number;
    /**
     * y position in map
     */
    y?: number;
    /**
     * heading, in radians
     */
    heading?: number;
}


export class GridPosition {
    public position: number;
    public x: number;
    public y: number;
    public heading: number;

    constructor(config?: GridPositionArgs) {
        this.position = config?.position || 1;
        this.x = config?.x || 0;
        this.y = config?.y || 0;
        this.heading = config?.heading || 0;
    }
}