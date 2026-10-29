/** Shared layout of the parliament hall: a circle centred behind the fight plane (z = 0), seen from +z. */
export const CENTER_Z = -1.5;
/** Radius of the rangoli floor disc. */
export const FLOOR_R = 7.5;
export const COLONNADE_R = 12.5;
/** The visible back arc spans this many radians either side of straight behind the fighters. */
export const ARC_HALF = (105 * Math.PI) / 180;
export const COLUMN_STEP = (7.5 * Math.PI) / 180;
export const WALL_R = 15;

/** Position on a circle of radius `r` around the hall centre; `theta` 0 is straight back (-z). */
export const onCircle = (r: number, theta: number): { x: number; z: number } => ({
  x: r * Math.sin(theta),
  z: CENTER_Z - r * Math.cos(theta),
});
