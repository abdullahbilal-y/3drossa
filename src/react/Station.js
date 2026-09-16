"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { stageBeats } from "./createStage.js";
import useDocument from "./useDocument.js";

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

  // Re-read when the editor replaces the document, so retuning a station's
  // length or its placement takes effect as you type rather than on reload.
  useDocument(stage);

  const config = stage?.journey.stations.get(station);

  /**
   * An id the document has never heard of: warn, and render as ordinary copy.
   *
   * This used to throw. It is a real authoring mistake and deserves to be
   * loud — but throwing during render takes the whole page down, and the two
   * ways it happens are both cases where that is the wrong trade. Renaming a
   * station in the editor orphans every <Station> in the host's markup until
   * you update the JSX, so a rename would destroy the page you were editing.
   * And a station dropped from the document should degrade a live site to an
   * unpinned section, not to a white screen.
   *
   * Unpinned is the honest fallback: it is exactly what a reader with
   * prefers-reduced-motion gets, so the content is known to hold up without
   * the choreography.
   */
  useEffect(() => {
    if (!stage || config) return;
    console.warn(
      `3drossa: <Station station="${station}"> is not in the journey document, ` +
        `so it renders unpinned. Known: ${[...stage.journey.stations.keys()].join(", ")}`
    );
  }, [stage, config, station]);

  const scroll = config ? config.scroll : 1;
  const lead = config ? config.lead : 0;
  const trail = config ? config.trail : 0;

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
    /**
     * An orphaned station is treated exactly like reduced motion.
     *
     * Not merely "do not pin": the beats must be left VISIBLE. Staging starts
     * by hiding every beat and reveals them from the pin's clock, so a station
     * that hides its copy and then never registers has silently deleted a
     * section of the page.
     *
     * Registering would be worse still — the stage would report a pin for an id
     * the journey cannot resolve, and the sampler would throw once per frame.
     */
    if (stage.state.reducedMotion || !config) {
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
       * Where the layout actually put this, in page pixels.
       *
       * The document says where a station was MEANT to be; only the DOM knows
       * where it ended up, and the two drift every time the copy above it
       * changes. Exposing it is what lets the editor show the drift instead of
       * leaving it to be discovered as the subject arriving at a framing before
       * or after the page has stopped.
       */
      bounds: () => ({
        top: root.offsetTop,
        range: root.offsetHeight - window.innerHeight,
      }),

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
  }, [stage, station, config]);

  const outerStyle = useMemo(
    () => ({
      // (1 + scroll) viewport heights: one for the frame itself, `scroll` more
      // for the pin to consume. pinSpacing done by the box model, so the
      // document height stays honest and everything below still measures.
      height: `calc(${1 + scroll} * 100svh)`,
      /**
       * Where the station sits, as margin.
       *
       * Margin rather than a spacer element because `offsetTop` already
       * accounts for it — so the measured pin, the editor's readout and the
       * handoffs all follow a move with no further arithmetic anywhere. A
       * spacer would have needed every one of them taught about it.
       */
      ...(lead ? { marginTop: `calc(${lead} * 100svh)` } : null),
      ...(trail ? { marginBottom: `calc(${trail} * 100svh)` } : null),
      position: "relative",
      ...style,
    }),
    [scroll, lead, trail, style]
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
