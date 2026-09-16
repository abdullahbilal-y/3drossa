"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The inspector: a timeline, a row per waypoint, and Save.
 *
 * Rendered into document.body rather than into the canvas container, so it sits
 * above both the page and the raised canvas regardless of how the host has
 * stacked them.
 *
 * It can be moved and collapsed, because it is a slab down one edge and the
 * copy you most need to see is often the copy underneath it. Drag it by the
 * header to the other side, or collapse it to a stub to look at the page.
 */
function usePlacement() {
  const [side, setSide] = useState("right");
  const [collapsed, setCollapsed] = useState(false);
  const drag = useRef(null);

  const onPointerDown = useCallback((event) => {
    // Presses that start on a control belong to the control.
    if (event.target.closest("button,input")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX };
  }, []);

  const onPointerUp = useCallback((event) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    /**
     * Snap to the half it was released in rather than leaving it floating.
     * A panel parked mid-screen covers more of the page than one docked to an
     * edge, which defeats the point of moving it.
     */
    setSide(event.clientX < window.innerWidth / 2 ? "left" : "right");
  }, []);

  return { side, setSide, collapsed, setCollapsed, dragProps: { onPointerDown, onPointerUp } };
}

const S = {
  panel: {
    // Absolute, not fixed: the editor portals this into its own fixed overlay,
    // so the overlay does the viewport pinning and this just fills its right
    // edge. Fixed would be measured against drei Html transformed wrapper.
    position: "absolute",
    top: 0,
    bottom: 0,
    pointerEvents: "auto",
    width: "23rem",
    maxWidth: "100vw",
    display: "flex",
    flexDirection: "column",
    background: "rgba(14,13,12,0.94)",
    backdropFilter: "blur(12px)",
    color: "#efe6da",
    font: "12px/1.5 ui-sans-serif, system-ui, sans-serif",
    borderLeft: "1px solid #2c2825",
    zIndex: 60,
  },
  section: { padding: "12px 14px", borderBottom: "1px solid #221f1d" },
  label: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    opacity: 0.55,
  },
  input: {
    width: "100%",
    background: "transparent",
    border: 0,
    borderBottom: "1px solid #2c2825",
    color: "inherit",
    font: "inherit",
    padding: "2px 0",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: 0,
    font: "inherit",
    fontWeight: 500,
    cursor: "pointer",
  },
};

export default function Panel({
  stage,
  journey,
  doc,
  selection,
  onSelect,
  onUpdatePoint,
  onUpdateStationKey,
  onUpdateStation,
  onRenameStation,
  onUpdateCamera,
  onSetCameraMode,
  onUpdateCameraPoint,
  onAddCameraPoint,
  onRemoveCameraPoint,
  onAddPoint,
  onInsertAfter,
  onAddStation,
  onRemoveStation,
  onRemovePoint,
  onSave,
  canWrite,
  onCopy,
  onRevert,
  stored,
  status,
  dragging,
  freeCamera,
  onToggleCamera,
}) {
  const [progress, setProgress] = useState(0);
  const { side, setSide, collapsed, setCollapsed, dragProps } = usePlacement();

  /**
   * The scrub bar reads the page while you scroll it, and drives the page when
   * you drag it. It is the same value either way — the editor never keeps its
   * own idea of where the reader is, because a second source of truth for
   * progress is exactly what produces beats that fire in the wrong place.
   */
  useEffect(() => {
    let frame;
    const read = () => {
      frame = requestAnimationFrame(read);
      setProgress(stage.state.progress);
    };
    frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  const ranges = [...journey.ranges.entries()];
  const active = ranges.find(([, r]) => progress >= r.from && progress <= r.to);

  const edge = side === "left" ? { left: 0, right: "auto" } : { right: 0, left: "auto" };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          ...S.button,
          position: "absolute",
          top: 12,
          ...edge,
          width: "auto",
          pointerEvents: "auto",
          padding: "6px 10px",
          background: "rgba(14,13,12,0.9)",
          color: "#efe6da",
          border: "1px solid #2c2825",
        }}
      >
        3drossa · {progress.toFixed(3)}
      </button>
    );
  }

  return (
    <div
      style={{
        ...S.panel,
        ...edge,
        borderLeft: side === "right" ? "1px solid #2c2825" : 0,
        borderRight: side === "left" ? "1px solid #2c2825" : 0,
        opacity: dragging ? 0.35 : 1,
      }}
    >
      <div style={{ ...S.section, cursor: "grab" }} {...dragProps}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.label}>3drossa · drag to move</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ ...S.label, letterSpacing: 0 }}>
              {progress.toFixed(3)} · {active ? active[0] : "travel"}
            </span>
            <button
              onClick={() => setSide(side === "right" ? "left" : "right")}
              title="Move to the other side"
              style={{ ...S.button, width: "auto", padding: "2px 7px", background: "#221f1d", color: "#efe6da" }}
            >
              {side === "right" ? "←" : "→"}
            </button>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse"
              style={{ ...S.button, width: "auto", padding: "2px 7px", background: "#221f1d", color: "#efe6da" }}
            >
              –
            </button>
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {/*
            Editing wants a still camera you control; the composed shot is a
            separate question. Preview hands the camera back to the page so you
            can check the framing you just authored.
          */}
          <button
            onClick={onToggleCamera}
            style={{
              ...S.button,
              padding: "4px 10px",
              background: freeCamera ? "#f5a623" : "#221f1d",
              color: freeCamera ? "#11100f" : "#efe6da",
            }}
          >
            {freeCamera ? "Camera: free — drag to orbit" : "Camera: page view"}
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => stage.scrollTo(Number(e.target.value))}
          style={{ width: "100%", marginTop: 8, accentColor: "#f5a623" }}
        />

        {/* Where the stations sit in the scroll, to scale. */}
        <div
          style={{
            position: "relative",
            height: 6,
            marginTop: 6,
            borderRadius: 3,
            background: "#2c2825",
            overflow: "hidden",
          }}
        >
          {ranges.map(([id, r]) => (
            <div
              key={id}
              title={id}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${r.from * 100}%`,
                width: `${(r.to - r.from) * 100}%`,
                background: "#2e9d8f",
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${progress * 100}%`,
              width: 2,
              background: "#ffffff",
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ ...S.section, borderBottom: "1px solid #2c2825" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={S.label}>Stations</span>
            <button
              onClick={onAddStation}
              title="Add a station at the current scroll position"
              style={{ ...S.button, width: "auto", padding: "2px 9px", background: "#221f1d", color: "#efe6da" }}
            >
              + add station
            </button>
          </div>
          {/*
            A row per station rather than a chip, because a station has things
            worth reading at a glance — its name, how long it holds the page,
            and whether the reader is inside it right now. The chip version made
            every station look identical and gave the name nowhere to live.
          */}
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {doc.stations.map((s) => {
              const on = selection?.kind === "station" && selection.id === s.id;
              const here = active?.[0] === s.id;
              const range = journey.ranges.get(s.id);

              return (
                <div
                  key={s.id}
                  style={{
                    borderRadius: 6,
                    border: `1px solid ${on ? "#9b6bff" : "#221f1d"}`,
                    background: on ? "#1a1620" : "transparent",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                    }}
                  >
                    <button
                      onClick={() =>
                        onSelect(on ? null : { kind: "station", id: s.id, key: 0 })
                      }
                      title={on ? "Collapse" : "Edit this station"}
                      style={{
                        ...S.button,
                        width: "auto",
                        padding: "2px 7px",
                        background: on ? "#9b6bff" : "#221f1d",
                        color: on ? "#11100f" : "#efe6da",
                      }}
                    >
                      {on ? "▾" : "▸"}
                    </button>

                    <StationName id={s.id} onRename={onRenameStation} />

                    {/* A dot while the reader is inside it — the fastest way to
                        tell which station you are actually looking at. */}
                    {here ? (
                      <span
                        title="the reader is inside this station"
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 7,
                          background: "#2e9d8f",
                          flex: "none",
                        }}
                      />
                    ) : null}

                    <span style={{ opacity: 0.4, fontSize: 11, whiteSpace: "nowrap" }}>
                      {range ? `${range.from.toFixed(2)}–${range.to.toFixed(2)}` : "unused"}
                    </span>

                    <button
                      onClick={() => onRemoveStation(s.id)}
                      title="Remove this station and its handoff waypoints"
                      style={{
                        ...S.button,
                        width: "auto",
                        padding: "0 6px",
                        background: "transparent",
                        color: "#ff8b7a",
                        opacity: 0.75,
                      }}
                    >
                      x
                    </button>
                  </div>

                  {on ? (
                    <StationEditor
                      station={s}
                      selection={selection}
                      onSelect={onSelect}
                      onUpdate={onUpdateStationKey}
                      onUpdateStation={onUpdateStation}
                      stationsDriveCamera={!!doc.camera.stations}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <CameraSection
          camera={doc.camera}
          lens={doc.lens}
          rows={doc.cameraPath}
          onUpdate={onUpdateCamera}
          onSetMode={onSetCameraMode}
          onUpdateRow={onUpdateCameraPoint}
          onAddRow={onAddCameraPoint}
          onRemoveRow={onRemoveCameraPoint}
        />

        <div style={S.label} className="rossa-heading">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px 0",
            }}
          >
            <span>Path</span>
            <button
              onClick={onAddPoint}
              title="Add a waypoint at the current scroll position"
              style={{
                ...S.button,
                width: "auto",
                padding: "2px 9px",
                background: "#221f1d",
                color: "#efe6da",
              }}
            >
              + add here
            </button>
          </div>
        </div>

        {doc.path.map((point, i) => {
          const derived = point.station !== undefined;
          const on = selection?.kind === "path" && selection.index === i;
          const resolved = derived
            ? journey.stationSubject(point.station, point.at)
            : point;

          return (
            <div
              key={i}
              onClick={() => onSelect({ kind: "path", index: i })}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #221f1d",
                background: on ? "#1d1a18" : "transparent",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ opacity: 0.45 }}>#{i}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {derived ? (
                    <span style={{ color: "#2e9d8f" }}>
                      {point.station} @ {point.at}
                    </span>
                  ) : null}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onInsertAfter(i);
                    }}
                    title="Insert a waypoint after this one"
                    style={{
                      ...S.button,
                      width: "auto",
                      padding: "0 6px",
                      background: "transparent",
                      color: "#7fd3a8",
                      opacity: 0.8,
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePoint(i);
                    }}
                    title="Remove this waypoint"
                    style={{
                      ...S.button,
                      width: "auto",
                      padding: "0 6px",
                      background: "transparent",
                      color: "#ff8b7a",
                      opacity: 0.75,
                    }}
                  >
                    x
                  </button>
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                {["p", "sx", "y", "z"].map((key) => {
                  /**
                   * A station row has no authored sx/y/z. Showing the RESOLVED
                   * value read-only is what makes the handoff legible: you can
                   * see the spline and the station agree at the boundary, which
                   * is the thing that silently drifts and reads as teleporting.
                   */
                  const locked = derived && key !== "p";
                  const value = locked ? resolved[key] : point[key];

                  return (
                    <label key={key}>
                      <div style={{ ...S.label, fontSize: 9 }}>{key}</div>
                      <input
                        type="number"
                        step={key === "p" ? 0.005 : 0.01}
                        value={typeof value === "number" ? Number(value.toFixed(3)) : ""}
                        disabled={locked}
                        onChange={(e) =>
                          onUpdatePoint(i, { [key]: Number(e.target.value) })
                        }
                        style={{ ...S.input, opacity: locked ? 0.45 : 1 }}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...S.section, borderBottom: 0, display: "grid", gap: 8 }}>
        {status ? (
          <div
            style={{
              fontSize: 11,
              color:
                status.kind === "error"
                  ? "#ff8b7a"
                  : status.kind === "ok"
                    ? "#7fd3a8"
                    : "#efe6da",
            }}
          >
            {status.message}
          </div>
        ) : null}

        {/*
          The draft is not the file. Saying which is which out loud is the
          difference between "my work is safe" and "my work is safe on this
          machine, in this browser, until I clear site data".
        */}
        {onRevert ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
              opacity: 0.6,
            }}
          >
            <span>{stored ? "Draft kept in this browser" : "Draft not saved"}</span>
            <button
              onClick={onRevert}
              title="Throw the draft away and go back to the saved document"
              style={{
                ...S.button,
                width: "auto",
                padding: "2px 8px",
                background: "transparent",
                color: "#ff8b7a",
              }}
            >
              revert
            </button>
          </div>
        ) : null}

        <button
          onClick={onSave}
          style={{ ...S.button, background: "#f5a623", color: "#11100f" }}
        >
          {canWrite ? "Save to journey.json" : "Download journey.json"}
        </button>
        <button
          onClick={onCopy}
          style={{
            ...S.button,
            background: "transparent",
            border: "1px solid #2c2825",
            color: "inherit",
          }}
        >
          Copy document
        </button>
      </div>
    </div>
  );
}

/**
 * A station's name, editable in place.
 *
 * Local state with a commit on blur or Enter, rather than writing through on
 * every keystroke. Renaming rewrites every path row that derives from the
 * station, and half a name is a name nothing points at — so the intermediate
 * states of typing must not reach the document.
 */
function StationName({ id, onRename }) {
  const [draft, setDraft] = useState(id);

  // Follow the document when the id changes underneath us — another station
  // removed, a rename rejected as a duplicate.
  useEffect(() => setDraft(id), [id]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== id) onRename(id, draft);
    else setDraft(id);
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(id);
          e.currentTarget.blur();
        }
      }}
      title="The station's id. Renaming takes its waypoints with it."
      style={{ ...S.input, flex: 1, minWidth: 0, fontWeight: 500 }}
    />
  );
}

const field = (label, value, onChange, step = 0.01) => (
  <label key={label} style={{ display: "block", minWidth: 0 }}>
    <div style={{ ...S.label, fontSize: 9 }}>{label}</div>
    <input
      type="number"
      step={step}
      value={typeof value === "number" ? Number(value.toFixed(3)) : ""}
      onChange={(e) => onChange(Number(e.target.value))}
      style={S.input}
    />
  </label>
);

const grid = (children, columns = 4) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 8,
      marginTop: 6,
    }}
  >
    {children}
  </div>
);

const vector = (label, values, onChange) => (
  <>
    <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>{label}</div>
    {grid(
      ["x", "y", "z"].map((axis, i) =>
        field(axis, values?.[i], (v) => {
          const next = [...(values || [0, 0, 0])];
          next[i] = v;
          onChange(next);
        })
      ),
      3
    )}
  </>
);

/**
 * Everything a station is, in one place.
 *
 * The camera keyframes are here for the first time. They were the half of the
 * document you could only change by hand-editing `lerp()` calls — and they are
 * the half that governs the moments the page actually stops to look at
 * something, so leaving them out made the editor look like it covered the
 * journey when it covered two thirds of it.
 */
function StationEditor({
  station,
  selection,
  onSelect,
  onUpdate,
  onUpdateStation,
  stationsDriveCamera,
}) {
  const [tab, setTab] = useState("subject");
  if (!station) return null;

  return (
    <div style={{ padding: "0 8px 10px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <label style={{ width: "6.5rem" }}>
          <div style={{ ...S.label, fontSize: 9 }}>holds for</div>
          <input
            type="number"
            step={0.1}
            min={0.1}
            value={station.scroll}
            onChange={(e) =>
              onUpdateStation(station.id, { scroll: Math.max(0.1, Number(e.target.value)) })
            }
            style={S.input}
          />
        </label>
        <span style={{ opacity: 0.45, paddingBottom: 3 }}>viewport heights of scroll</span>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {["subject", "camera"].map((which) => (
          <button
            key={which}
            onClick={() => setTab(which)}
            style={{
              ...S.button,
              width: "auto",
              padding: "3px 10px",
              background: tab === which ? "#9b6bff" : "#221f1d",
              color: tab === which ? "#11100f" : "#efe6da",
            }}
          >
            {which}
          </button>
        ))}
      </div>

      {/*
        A station's camera keyframes are written whether or not anything reads
        them. Saying so here is the difference between a setting that looks
        broken and one you turned off on purpose two screens away.
      */}
      {tab === "camera" && !stationsDriveCamera ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#f5a623", opacity: 0.85 }}>
          Station framings are switched off under Camera, so these are stored but
          ignored.
        </div>
      ) : null}

      {station[tab].map((key, i) => {
        const on = tab === "subject" && selection.key === i;

        return (
          <div
            key={i}
            onClick={() =>
              tab === "subject" && onSelect({ kind: "station", id: station.id, key: i })
            }
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${on ? "#9b6bff" : "#221f1d"}`,
              cursor: tab === "subject" ? "pointer" : "default",
            }}
          >
            <div style={{ opacity: 0.5 }}>
              t = {key.t}
              {key.t === 0 ? " · arriving" : key.t === 1 ? " · leaving" : ""}
            </div>

            {tab === "subject" ? (
              grid(
                ["sx", "y", "z", "scale"].map((channel) =>
                  field(channel, key[channel] ?? 0, (v) =>
                    onUpdate(station.id, "subject", i, { [channel]: v })
                  )
                )
              )
            ) : (
              <>
                {vector("position", key.position, (next) =>
                  onUpdate(station.id, "camera", i, { position: next })
                )}
                {vector("looks at", key.target, (next) =>
                  onUpdate(station.id, "camera", i, { target: next })
                )}
                <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>fov</div>
                {grid(
                  [
                    field("degrees", key.fov, (v) =>
                      onUpdate(station.id, "camera", i, { fov: v }), 0.5
                    ),
                  ],
                  3
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The lens, as editable data.
 *
 * These were hardcoded coefficients in the renderer. Putting them here is what
 * makes "the whole journey is one document" actually true — and "locked" with
 * stations off is the answer to the most common request of all: a camera that
 * simply does not move.
 */
function CameraSection({ camera, lens, rows, onUpdate, onSetMode, onUpdateRow, onAddRow, onRemoveRow }) {
  if (!camera) return null;

  const modes = {
    follow: "Leans toward the subject",
    beats: "Follows the beats track only",
    locked: "Never moves",
    path: "Flies its own spline, bound to scroll",
  };

  return (
    <div style={{ ...S.section, borderBottom: "1px solid #2c2825" }}>
      <div style={S.label}>Camera</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {Object.entries(modes).map(([mode, title]) => (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={title}
            style={{
              ...S.button,
              width: "auto",
              padding: "4px 10px",
              background: camera.mode === mode ? "#f5a623" : "#221f1d",
              color: camera.mode === mode ? "#11100f" : "#efe6da",
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <input
          type="checkbox"
          checked={!!camera.stations}
          onChange={(e) => onUpdate({ stations: e.target.checked })}
        />
        <span style={{ ...S.label, letterSpacing: 0, fontSize: 11 }}>
          station framings take over the camera
        </span>
      </label>

      {camera.mode === "locked" ? (
        <>
          {vector("position", camera.position, (next) => onUpdate({ position: next }))}
          {vector("looks at", camera.target, (next) => onUpdate({ target: next }))}

          {/*
            A locked lens holds this fov and ignores the beats track. Before it
            existed, "locked" meant locked in POSITION only — so a camera you
            had explicitly nailed down still drifted a few degrees in and out
            across the page, which reads as a slow zoom nobody asked for.
          */}
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>fov</div>
          {grid(
            [
              field(
                `degrees (blank = lens ${lens.fov})`,
                camera.fov ?? lens.fov,
                (v) => onUpdate({ fov: v }),
                0.5
              ),
            ],
            2
          )}
        </>
      ) : null}

      {camera.mode === "follow" ? (
        <>
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>lean toward subject</div>
          {grid(
            ["x", "y", "targetX", "targetY"].map((key) =>
              field(key, camera.follow[key], (v) =>
                onUpdate({ follow: { ...camera.follow, [key]: v } })
              )
            )
          )}
        </>
      ) : null}

      <CameraPathSection
        camera={camera}
        rows={rows}
        onUpdate={onUpdate}
        onUpdateRow={onUpdateRow}
        onAddRow={onAddRow}
        onRemoveRow={onRemoveRow}
      />

      <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>pointer parallax</div>
      {grid(
        ["x", "y"].map((axis) =>
          field(axis, camera.parallax[axis], (v) =>
            onUpdate({ parallax: { ...camera.parallax, [axis]: v } })
          )
        )
      )}

      <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>damping</div>
      {grid(
        ["position", "station", "parallax", "fov"].map((key) =>
          field(
            key,
            camera.damping[key],
            (v) => onUpdate({ damping: { ...camera.damping, [key]: v } }),
            0.1
          )
        )
      )}
    </div>
  );
}

/**
 * The camera's route.
 *
 * Shown whenever the document has one, not only in "path" mode: you author a
 * route from wherever the page is now and switch to it when it is worth
 * switching to. A route you can only see once it is already driving the page is
 * one you would have to author blind.
 */
function CameraPathSection({ camera, rows, onUpdate, onUpdateRow, onAddRow, onRemoveRow }) {
  const on = camera.mode === "path";
  if (!on && rows.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #221f1d" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={S.label}>Camera path {on ? "" : "· not in use"}</span>
        <button
          onClick={onAddRow}
          title="Add a camera waypoint at the current scroll position"
          style={{
            ...S.button,
            width: "auto",
            padding: "2px 9px",
            background: "#221f1d",
            color: "#efe6da",
          }}
        >
          + camera point
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }}>
        Drag the pink handles for where the lens goes, the blue ones for what it
        looks at. Switch the camera to <b>free</b> to see them — in page view
        they sit at the eye you are looking through.
      </div>

      {rows.length >= 2 ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {["path", "subject"].map((which) => (
            <button
              key={which}
              onClick={() => onUpdate({ pathTarget: which })}
              title={
                which === "path"
                  ? "The lens looks at its own target spline"
                  : "The lens looks at the subject, wherever the route takes it"
              }
              style={{
                ...S.button,
                width: "auto",
                padding: "3px 9px",
                background: camera.pathTarget === which ? "#7ad9ff" : "#221f1d",
                color: camera.pathTarget === which ? "#11100f" : "#efe6da",
              }}
            >
              looks at: {which}
            </button>
          ))}
        </div>
      ) : null}

      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            marginTop: 6,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #221f1d",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ opacity: 0.45 }}>#{i}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {field("p", row.p, (v) => onUpdateRow(i, { p: v }), 0.005)}
              <button
                onClick={() => onRemoveRow(i)}
                title="Remove this camera waypoint"
                style={{
                  ...S.button,
                  width: "auto",
                  padding: "0 6px",
                  background: "transparent",
                  color: "#ff8b7a",
                  opacity: 0.75,
                }}
              >
                x
              </button>
            </span>
          </div>

          {vector("position", row.position, (next) => onUpdateRow(i, { position: next }))}
          {camera.pathTarget === "subject" ? null : (
            vector("looks at", row.target, (next) => onUpdateRow(i, { target: next }))
          )}
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>fov</div>
          {grid(
            [field("degrees", row.fov, (v) => onUpdateRow(i, { fov: v }), 0.5)],
            3
          )}
        </div>
      ))}
    </div>
  );
}
