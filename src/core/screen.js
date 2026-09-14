/**
 * Screen-space authoring.
 *
 * The single most important idea in this engine, and the least obvious.
 *
 * Waypoints are authored as `sx` — a fraction of the visible half-width AT
 * THAT DEPTH, where 0 is centre and 1 is the edge of frame. They are NOT world
 * x. The reason: the visible world width shrinks as you approach the lens, so
 * a world-x of 3.0 is a comfortable margin beside the text at z = -1 and
 * completely off-screen at z = +1.5. Authoring in sx makes "stay out of the
 * text column" mean the same thing at every depth, which is what lets a path
 * dive toward the camera without ever landing on the copy.
 *
 * The lens is a fixed REFERENCE frame, not the live camera. The curve is built
 * once; being a few percent out in the margin is invisible, and rebuilding a
 * spline on every resize is not free. Narrow viewports are handled by a
 * separate squash, not by re-deriving this.
 */

const DEG = Math.PI / 180;

export function createLens(lens = {}) {
  const { z = 5.9, fov = 38, aspect = 1.6 } = lens;

  if (!(aspect > 0)) throw new Error("3drossa: lens.aspect must be > 0");
  if (!(fov > 0 && fov < 180)) throw new Error("3drossa: lens.fov must be in (0, 180)");

  const halfFovTan = Math.tan((fov * DEG) / 2);

  /**
   * Half the visible width at a given depth.
   *
   * Depths BEHIND the lens (z > lens.z) would give a negative width and flip
   * the sign of every sx, silently mirroring the path. That is a broken
   * document, not a value to interpolate, so it throws.
   */
  const halfWidthAt = (depth) => {
    const distance = z - depth;
    if (distance <= 0) {
      throw new Error(
        `3drossa: waypoint at z=${depth} is at or behind the lens (z=${z}); ` +
          `screen-space x is undefined there`
      );
    }
    return distance * halfFovTan * aspect;
  };

  return {
    z,
    fov,
    aspect,
    halfFovTan,
    halfWidthAt,
    /** Screen space -> world. */
    toWorldX: (sx, depth) => sx * halfWidthAt(depth),
    /** World -> screen space. The inverse the editor needs to store a drag. */
    toScreenX: (x, depth) => x / halfWidthAt(depth),
    toJSON: () => ({ z, fov, aspect }),
  };
}
