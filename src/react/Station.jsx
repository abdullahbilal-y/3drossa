"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { stageBeats } from "./stage.js";

/**
 * A station: the page stops, the world takes over, the content arrives.
 *
 * This is the structural idea that makes a page read as a place rather than as
 * a stack of sections. The section pins for a fixed run of scroll; while it is
 * held, the camera takes up that station's written framing, the subject plays
 * to it, and the copy arrives on beats inside the held frame.
 *
 * Pinned with `position: sticky` and a measured range — no GSAP, no
 * ScrollTrigger, no scroll library. Requiring a peer dependency to try an
 * engine is an adoption tax, and sticky does this natively. Anyone who already
 * runs GSAP or Lenis keeps them: they drive the scroll, this reads it.
 *
 * The clock is the station's OWN progress (`t`, 0..1), never page progress.
 * That is what makes it robust — a station's choreography is unaffected by how
 * long the sections above it happen to be, so editing copy can never drift a
 * beat off its mark.
 */
export default function Station({
  stage,
  id,
  station = id,
  children,
  className = "",
  style,
  ...rest
}) {
  const outer = useRef(null);
  const sticky = useRef(null);

  const config = stage?.journey.stations.get(station);
  if (stage && !config) {
    throw new Error(
      `3drossa: <Station station="${station}"> is not in the journey document. ` +
        `Known: ${[...stage.journey.stations.keys()].join(", ")}`
    );
  }

  const scroll = config ? config.scroll : 1;

  useLayoutEffect(() => {
    if (!stage || !outer.current) return;

    const root = outer.current;
    const beats = Array.from(root.querySelectorAll("[data-beat]"));

    /**
     * Reduced motion gets the content with no pin and no staging.
     *
     * A viewport that only releases after several screens of scrolling is
     * exactly the thing that makes motion-sensitive readers leave, and the
     * page reads perfectly well as a plain document. This is not a degraded
     * mode to apologise for; it is the same content without the choreography.
     */
    if (stage.state.reducedMotion) {
      for (const el of beats) {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
      return;
    }

    for (const el of beats) {
      el.style.opacity = "0";
      el.style.transform = "translate3d(0, 26px, 0)";
      el.style.willChange = "opacity, transform";
    }

    return stage.registerStation(station, {
      /**
       * How far through the pin we are, or null if it does not hold the
       * viewport. Measured from the live layout rather than from the document:
       * the document says where a station was meant to be, the DOM knows where
       * it ended up.
       */
      measure: (scrollY) => {
        const top = root.offsetTop;
        const range = root.offsetHeight - window.innerHeight;
        if (range <= 0) return null;

        const t = (scrollY - top) / range;
        return t < 0 || t > 1 ? null : t;
      },
      stage: (t) => stageBeats(beats, t),
    });
  }, [stage, station]);

  const outerStyle = useMemo(
    () => ({
      // (1 + scroll) viewport heights: one for the frame itself, `scroll` more
      // for the pin to consume. pinSpacing done by the box model, so the
      // document height stays honest and everything below still measures.
      height: `calc(${1 + scroll} * 100svh)`,
      position: "relative",
      ...style,
    }),
    [scroll, style]
  );

  return (
    <section
      id={id}
      ref={outer}
      data-section={id}
      data-station={station}
      style={outerStyle}
      {...rest}
    >
      <div
        ref={sticky}
        className={className}
        style={{
          position: "sticky",
          top: 0,
          height: "100svh",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </section>
  );
}
