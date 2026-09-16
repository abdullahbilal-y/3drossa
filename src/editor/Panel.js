"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The inspector: a scrub bar, a section per thing you can edit, and Save.
 *
 * Rendered into the editor's own fixed overlay rather than into the canvas
 * container, so it sits above both the page and the raised canvas regardless of
 * how the host has stacked them.
 *
 * Every section collapses, and only the one you are working in is open. A
 * journey has four independent kinds of thing in it — the subject, the
 * stations, the camera and the path — and showing all four at once produced one
 * long column of near-identical number fields in which it was genuinely hard to
 * tell what you were looking at.
 */

const S = {
  panel: {
    // Absolute, not fixed: the editor portals this into its own fixed overlay,
    // so the overlay does the viewport pinning and this just fills one edge.
    // Fixed would be measured against drei's transformed Html wrapper.
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
  chip: {
    width: "auto",
    padding: "2px 9px",
    borderRadius: 6,
    border: 0,
    font: "inherit",
    cursor: "pointer",
    background: "#221f1d",
    color: "#efe6da",
  },
  hint: { fontSize: 11, opacity: 0.45, marginTop: 6 },
};

/**
 * Moving the panel out of the way.
 *
 * The header said "drag to move" and did not move: it only read where you let
 * go and jumped to that side. A control that ignores the whole gesture and then
 * teleports reads as broken even when it lands where you wanted.
 *
 * So the panel now follows the pointer and snaps to the nearer edge on release.
 * The follow is written straight to `style.transform` through a ref rather than
 * through state — the panel can hold a hundred number fields, and re-rendering
 * all of them on every pointermove is exactly the kind of drag that feels like
 * it is fighting you.
 *
 * Horizontal only. The panel is full height, so translating it vertically
 * leaves a strip of nothing at one end and reads as a rendering fault.
 */
function usePlacement() {
  const [side, setSide] = useState("right");
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef(null);
  const drag = useRef(null);

  const onPointerDown = useCallback((event) => {
    // Presses that start on a control belong to the control.
    if (event.target.closest("button,input,select")) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX };
    if (panel.current) panel.current.style.transition = "none";
  }, []);

  const onPointerMove = useCallback((event) => {
    if (!drag.current || !panel.current) return;
    panel.current.style.transform = `translateX(${event.clientX - drag.current.x}px)`;
  }, []);

  const finish = useCallback((event) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (panel.current) {
      panel.current.style.transform = "";
      panel.current.style.transition = "";
    }

    // Snap to the half it was released in. A panel parked mid-screen covers
    // more of the page than one docked to an edge, which defeats moving it.
    setSide(event.clientX < window.innerWidth / 2 ? "left" : "right");
  }, []);

  return {
    side,
    setSide,
    collapsed,
    setCollapsed,
    panel,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}

/**
 * One collapsible section.
 *
 * `note` is the one-line summary shown while it is shut, so a closed section
 * still tells you something — how many stations there are, which camera mode is
 * running. A stack of identical closed headers is its own kind of unreadable.
 */
function Section({ title, note, open, onToggle, actions, children }) {
  return (
    <div style={{ borderBottom: "1px solid #221f1d" }}>
      <div
        onClick={onToggle}
        // A stable hook for tools/exercise.mjs, which has to open a section
        // before it can press anything inside it. Matching on heading text
        // would break the day a heading is reworded.
        data-rossa-section={title}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 14px",
          cursor: "pointer",
          background: open ? "#181614" : "transparent",
        }}
      >
        <span style={{ opacity: 0.5, width: 10 }}>{open ? "▾" : "▸"}</span>
        <span style={{ ...S.label, flex: 1 }}>{title}</span>
        {note ? (
          <span style={{ opacity: 0.4, fontSize: 11, whiteSpace: "nowrap" }}>{note}</span>
        ) : null}
        {/* Actions live in the header so a section can be acted on without
            being opened — "+ station" should not require reading it first. */}
        {actions ? (
          <span onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: 6 }}>
            {actions}
          </span>
        ) : null}
      </div>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

/** What the current selection is, in words. */
function describe(selection, doc) {
  if (!selection) return "nothing selected — click a handle in the scene";

  if (selection.kind === "path") {
    const row = doc.path[selection.index];
    if (!row) return "nothing selected";
    return row.station !== undefined
      ? `waypoint #${selection.index} — owned by station "${row.station}"`
      : `waypoint #${selection.index} — at ${Number(row.p).toFixed(3)} of the scroll`;
  }

  if (selection.kind === "station") {
    return `station "${selection.id}" — the subject ${
      selection.key === 0 ? "arriving" : "leaving"
    }`;
  }

  if (selection.kind === "camera") {
    return `camera waypoint #${selection.row} — ${
      selection.field === "position" ? "where the lens is" : "what it looks at"
    }`;
  }

  return "nothing selected";
}

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
  onSnapStation,
  onUpdateCamera,
  onUpdateSubject,
  onSetSubjectMode,
  dropping,
  canWriteModels,
  onUpdateOrbitPoint,
  onAddOrbitPoint,
  onRemoveOrbitPoint,
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
  const [open, setOpen] = useState({ path: true });
  const { side, setSide, collapsed, setCollapsed, panel, dragProps } = usePlacement();

  const toggle = (key) => setOpen((previous) => ({ ...previous, [key]: !previous[key] }));

  /**
   * Selecting something in the SCENE opens the section that edits it.
   *
   * Otherwise clicking a handle appears to do nothing: the fields that changed
   * are inside a section that is shut, and the only feedback is a handle
   * turning white.
   */
  useEffect(() => {
    if (!selection) return;
    const section =
      selection.kind === "station"
        ? "stations"
        : selection.kind === "camera"
          ? "camera"
          : "path";
    setOpen((previous) =>
      previous[section] ? previous : { ...previous, [section]: true }
    );
  }, [selection]);

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
      ref={panel}
      style={{
        ...S.panel,
        ...edge,
        borderLeft: side === "right" ? "1px solid #2c2825" : 0,
        borderRight: side === "left" ? "1px solid #2c2825" : 0,
        opacity: dragging ? 0.35 : 1,
      }}
    >
      <div style={{ ...S.section, cursor: "grab", touchAction: "none" }} {...dragProps}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.label}>3drossa</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ ...S.label, letterSpacing: 0 }}>
              {progress.toFixed(3)} · {active ? active[0] : "travel"}
            </span>
            <button
              onClick={() => setSide(side === "right" ? "left" : "right")}
              title="Move to the other side"
              style={S.chip}
            >
              {side === "right" ? "←" : "→"}
            </button>
            <button onClick={() => setCollapsed(true)} title="Collapse" style={S.chip}>
              –
            </button>
          </span>
        </div>

        {/*
          Editing wants a still camera you control; the composed shot is a
          separate question. Page view hands the camera back so you can check
          the framing you just authored.
        */}
        <button
          onClick={onToggleCamera}
          style={{
            ...S.button,
            marginTop: 8,
            padding: "4px 10px",
            background: freeCamera ? "#f5a623" : "#221f1d",
            color: freeCamera ? "#11100f" : "#efe6da",
          }}
        >
          {freeCamera ? "Camera: free — drag to orbit" : "Camera: page view"}
        </button>

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

        {/*
          What you are editing, in words, always in the same place. Without it
          the panel is several hundred anonymous number fields and the only clue
          to which one you just changed is a handle turning white.
        */}
        <div
          style={{
            marginTop: 8,
            padding: "5px 8px",
            borderRadius: 5,
            background: selection ? "#1d1a18" : "transparent",
            border: `1px solid ${selection ? "#2c2825" : "transparent"}`,
            fontSize: 11,
            opacity: selection ? 0.95 : 0.45,
          }}
        >
          {describe(selection, doc)}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <Section
          title="Subject"
          note={doc.subject.mode === "fixed" ? "standing still" : "travels the path"}
          open={!!open.subject}
          onToggle={() => toggle("subject")}
        >
          <SubjectSection
            subject={doc.subject}
            onUpdate={onUpdateSubject}
            onSetMode={onSetSubjectMode}
            canWriteModels={canWriteModels}
          />
        </Section>

        <Section
          title="Stations"
          note={`${doc.stations.length}`}
          open={!!open.stations}
          onToggle={() => toggle("stations")}
          actions={
            <button
              onClick={onAddStation}
              title="Add a station at the current scroll position"
              style={S.chip}
            >
              + station
            </button>
          }
        >
          <div style={{ display: "grid", gap: 6, padding: "0 14px 12px" }}>
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
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px" }}
                  >
                    <button
                      onClick={() => onSelect(on ? null : { kind: "station", id: s.id, key: 0 })}
                      title={on ? "Collapse" : "Edit this station"}
                      style={{
                        ...S.chip,
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
                        ...S.chip,
                        padding: "0 6px",
                        background: "transparent",
                        color: "#ff8b7a",
                      }}
                    >
                      x
                    </button>
                  </div>

                  {on ? (
                    <StationEditor
                      stage={stage}
                      doc={doc}
                      onUpdatePoint={onUpdatePoint}
                      onSnap={onSnapStation}
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
        </Section>

        <Section
          title="Camera"
          note={doc.camera.mode}
          open={!!open.camera}
          onToggle={() => toggle("camera")}
        >
          <CameraSection
            camera={doc.camera}
            lens={doc.lens}
            rows={doc.cameraPath}
            orbit={doc.orbit}
            onUpdateOrbitRow={onUpdateOrbitPoint}
            onAddOrbitRow={onAddOrbitPoint}
            onRemoveOrbitRow={onRemoveOrbitPoint}
            onUpdate={onUpdateCamera}
            onSetMode={onSetCameraMode}
            onUpdateRow={onUpdateCameraPoint}
            onAddRow={onAddCameraPoint}
            onRemoveRow={onRemoveCameraPoint}
          />
        </Section>

        <Section
          title="Path"
          note={`${doc.path.length} waypoints`}
          open={!!open.path}
          onToggle={() => toggle("path")}
          actions={
            <button
              onClick={onAddPoint}
              title="Add a waypoint at the current scroll position"
              style={S.chip}
            >
              + here
            </button>
          }
        >
          {doc.path.map((point, i) => {
            const derived = point.station !== undefined;
            const on = selection?.kind === "path" && selection.index === i;
            const resolved = derived ? journey.stationSubject(point.station, point.at) : point;

            return (
              <div
                key={i}
                onClick={() => onSelect({ kind: "path", index: i })}
                style={{
                  padding: "10px 14px",
                  borderTop: "1px solid #1a1817",
                  background: on ? "#1d1a18" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
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
                        ...S.chip,
                        padding: "0 6px",
                        background: "transparent",
                        color: "#7fd3a8",
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
                        ...S.chip,
                        padding: "0 6px",
                        background: "transparent",
                        color: "#ff8b7a",
                      }}
                    >
                      x
                    </button>
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
                          onChange={(e) => onUpdatePoint(i, { [key]: Number(e.target.value) })}
                          style={{ ...S.input, opacity: locked ? 0.45 : 1 }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      </div>

      <div
        style={{
          ...S.section,
          borderBottom: 0,
          borderTop: "1px solid #2c2825",
          display: "grid",
          gap: 8,
        }}
      >
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
              style={{ ...S.chip, background: "transparent", color: "#ff8b7a" }}
            >
              revert
            </button>
          </div>
        ) : null}

        <button onClick={onSave} style={{ ...S.button, background: "#f5a623", color: "#11100f" }}>
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

const vector = (label, values, onChange, step = 0.01) => (
  <>
    <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>{label}</div>
    {grid(
      ["x", "y", "z"].map((axis, i) =>
        field(
          axis,
          values?.[i],
          (v) => {
            const next = [...(values || [0, 0, 0])];
            next[i] = v;
            onChange(next);
          },
          step
        )
      ),
      3
    )}
  </>
);

/**
 * How the subject carries itself — and, crucially, which way it faces.
 *
 * The heading aims local +Z at the direction of travel. An imported model is
 * just as likely to have been built facing -Z or +X, and there is no way to
 * guess which: until this existed, a dropped-in model flying sideways or
 * tail-first could not be fixed without editing the host's own code.
 */
function SubjectSection({ subject, onUpdate, onSetMode, canWriteModels }) {
  if (!subject) return null;

  const fixed = subject.mode === "fixed";

  /** The four answers to "which way does your model face?", as one click. */
  const FACINGS = [
    { label: "+Z", rotation: [0, 0, 0] },
    { label: "-Z", rotation: [0, 180, 0] },
    { label: "+X", rotation: [0, -90, 0] },
    { label: "-X", rotation: [0, 90, 0] },
  ];

  const current = FACINGS.find((f) =>
    f.rotation.every((n, i) => Math.abs(n - (subject.rotation?.[i] ?? 0)) < 0.01)
  );

  return (
    <div style={{ padding: "0 14px 12px" }}>
      {/*
        The model file, first: it is the thing a person came here with.

        A path, not an upload widget, because the file lives in the repository
        like any other asset — dropping one on the page writes it there and
        fills this in. Typing a path by hand works just as well, which matters
        for a model that was already committed.
      */}
      <div style={{ ...S.label, fontSize: 9, marginTop: 4 }}>model</div>
      <input
        value={subject.model ?? ""}
        placeholder={canWriteModels ? "drop a .glb on the page" : "/models/car.glb"}
        onChange={(e) => onUpdate({ model: e.target.value.trim() || null })}
        style={{ ...S.input, marginTop: 2 }}
      />
      <div style={S.hint}>
        {canWriteModels
          ? "Drop a .glb anywhere on the page and it is written into your repo under public/."
          : "No save route, so a dropped model cannot be written. Commit the file and type its path."}
        {subject.model ? null : " Empty means the page renders its own subject."}
      </div>

      {/*
        The product-page case, because it changes what the rest means.
        A car does not fly across the page — it stands there while the camera
        moves around it.
      */}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {[
          ["path", "travels the path"],
          ["fixed", "stands still"],
        ].map(([mode, title]) => (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={title}
            style={{
              ...S.chip,
              padding: "4px 10px",
              background: subject.mode === mode ? "#f5a623" : "#221f1d",
              color: subject.mode === mode ? "#11100f" : "#efe6da",
            }}
          >
            {title}
          </button>
        ))}
      </div>
      {fixed ? (
        <div style={S.hint}>
          The path is ignored. Put the camera on <b>orbit</b> to move around it.
        </div>
      ) : null}

      {fixed ? vector("stands at", subject.position, (next) => onUpdate({ position: next })) : null}

      <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>size</div>
      {grid(
        [field("scale", subject.scale, (v) => onUpdate({ scale: v }), 0.05)],
        3
      )}
      <div style={S.hint}>
        A base size for the model, on top of the beats track. Downloaded models
        arrive in whatever units their author used.
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={!!subject.heading}
          disabled={fixed}
          onChange={(e) => onUpdate({ heading: e.target.checked })}
        />
        <span
          style={{ ...S.label, letterSpacing: 0, fontSize: 11, opacity: fixed ? 0.4 : 0.55 }}
        >
          turn to face the direction of travel
        </span>
      </label>

      <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>which way the model faces</div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {FACINGS.map((f) => (
          <button
            key={f.label}
            onClick={() => onUpdate({ rotation: [...f.rotation] })}
            title={`Its nose points along ${f.label} in the model file`}
            style={{
              ...S.chip,
              padding: "4px 10px",
              background: current?.label === f.label ? "#f5a623" : "#221f1d",
              color: current?.label === f.label ? "#11100f" : "#efe6da",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div style={S.hint}>
        If it flies tail-first or sideways, this is the setting. Type below for
        anything the four presets do not cover — pitch, roll, or a model that is
        simply crooked.
      </div>

      {vector("rotation, in degrees", subject.rotation, (next) => onUpdate({ rotation: next }), 1)}

      <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>feel</div>
      {grid(
        [
          field("chase", subject.damping, (v) => onUpdate({ damping: v }), 0.5),
          field("turn", subject.headingDamping, (v) => onUpdate({ headingDamping: v }), 0.5),
          field("idle", subject.bob, (v) => onUpdate({ bob: v }), 0.1),
        ],
        3
      )}
      <div style={S.hint}>
        How hard it chases the path, how fast it turns, and how much it drifts
        while nobody is scrolling. Idle 0 is perfectly still.
      </div>
    </div>
  );
}

/**
 * Where a station sits in the scroll — the authored half and the measured half.
 *
 * A station has two positions and only one of them is ours. The PIN is measured
 * from the DOM: it is wherever your <Station> sits in the markup, and the only
 * way to move it is to move the markup or change how long it holds. The
 * HANDOFFS are the two path rows that say where the spline meets it, and those
 * are authored.
 *
 * They were editable all along — as two `p` fields buried in the Path list,
 * several sections away from the station they belong to, which is a fair reason
 * to conclude a station's position is not editable at all. Showing both here,
 * side by side, is also the only way the drift between them is visible: when
 * they disagree, the subject arrives at the station's framing before or after
 * the page has stopped, and that reads as a teleport with no obvious cause.
 */
function StationPlacement({ stage, doc, station, onUpdatePoint, onSnap }) {
  const [measured, setMeasured] = useState(null);

  // Polled, not computed: the pin moves whenever the copy above it reflows, and
  // the stage only knows the scroll span after the reader has moved.
  useEffect(() => {
    const read = () => setMeasured(stage.measuredRange?.(station.id) ?? null);
    read();
    const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [stage, station.id]);

  const rows = doc.path
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.station === station.id)
    .sort((a, b) => a.row.p - b.row.p);

  if (rows.length === 0) {
    return (
      <div style={{ ...S.hint, marginTop: 0 }}>
        No waypoint hands off to this station, so nothing reaches it. Add one in
        the Path section.
      </div>
    );
  }

  const authored = { from: rows[0].row.p, to: rows[rows.length - 1].row.p };
  const drift = measured
    ? Math.max(Math.abs(measured.from - authored.from), Math.abs(measured.to - authored.to))
    : null;
  const adrift = drift !== null && drift > 0.01;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ ...S.label, fontSize: 9 }}>where it sits in the scroll</div>

      {grid(
        rows.map(({ row, index }, i) =>
          field(
            i === 0 ? "arrives at" : "leaves at",
            row.p,
            (v) => onUpdatePoint(index, { p: v }),
            0.005
          )
        ),
        2
      )}

      <div
        style={{
          ...S.hint,
          marginTop: 6,
          color: adrift ? "#f5a623" : undefined,
          opacity: adrift ? 0.9 : 0.45,
        }}
      >
        {measured ? (
          <>
            The pin your page measures is{" "}
            <b>
              {measured.from.toFixed(3)} – {measured.to.toFixed(3)}
            </b>
            .{" "}
            {adrift
              ? "The handoffs disagree, so the subject reaches this framing before or after the page stops."
              : "The handoffs agree with it."}
          </>
        ) : (
          "The pin is measured from your markup — scroll once so the page can report it."
        )}
      </div>

      {measured ? (
        <button
          onClick={() => onSnap(station.id)}
          title="Move the handoffs onto the pin the page actually produced"
          style={{ ...S.chip, marginTop: 6, padding: "3px 9px" }}
        >
          snap to the measured pin
        </button>
      ) : null}

      <div style={{ ...S.hint, marginTop: 8 }}>
        The pin is measured from your page. Move it with <b>room before</b>
        below, or by moving the <b>&lt;Station&gt;</b> in your markup.
      </div>
    </div>
  );
}

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
  stage,
  doc,
  station,
  selection,
  onSelect,
  onUpdate,
  onUpdateStation,
  onUpdatePoint,
  onSnap,
  stationsDriveCamera,
}) {
  const [tab, setTab] = useState("subject");
  if (!station) return null;

  return (
    <div style={{ padding: "0 8px 10px" }}>
      <StationPlacement
        stage={stage}
        doc={doc}
        station={station}
        onUpdatePoint={onUpdatePoint}
        onSnap={onSnap}
      />

      {grid(
        [
          field(
            "room before",
            station.lead,
            (v) => onUpdateStation(station.id, { lead: v }),
            0.25
          ),
          field(
            "holds for",
            station.scroll,
            (v) => onUpdateStation(station.id, { scroll: Math.max(0.1, v) }),
            0.1
          ),
          field(
            "room after",
            station.trail,
            (v) => onUpdateStation(station.id, { trail: v }),
            0.25
          ),
        ],
        3
      )}
      <div style={S.hint}>
        Viewport heights. <b>room before</b> is how you move the station: it
        pushes the whole section later in the scroll, and the measured pin
        follows. Negative pulls it earlier, eating the slack above — too much
        and it will overlap the section before it.
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {["subject", "camera"].map((which) => (
          <button
            key={which}
            onClick={() => setTab(which)}
            style={{
              ...S.chip,
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
        broken and one you turned off on purpose two sections away.
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
                {grid(
                  [field("fov", key.fov, (v) => onUpdate(station.id, "camera", i, { fov: v }), 0.5)],
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
function CameraSection({
  camera,
  lens,
  rows,
  orbit,
  onUpdate,
  onSetMode,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onUpdateOrbitRow,
  onAddOrbitRow,
  onRemoveOrbitRow,
}) {
  if (!camera) return null;

  const modes = {
    follow: "Leans toward the subject.",
    beats: "Follows the beats track only. No lean.",
    locked: "Never moves. Holds one position, one target, one fov.",
    path: "Flies its own spline, bound to scroll.",
    orbit: "Circles the subject at an authored angle and distance.",
  };

  return (
    <div style={{ padding: "0 14px 12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
        {Object.entries(modes).map(([mode, title]) => (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={title}
            style={{
              ...S.chip,
              padding: "4px 10px",
              background: camera.mode === mode ? "#f5a623" : "#221f1d",
              color: camera.mode === mode ? "#11100f" : "#efe6da",
            }}
          >
            {mode}
          </button>
        ))}
      </div>
      <div style={S.hint}>{modes[camera.mode]}</div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
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
          {grid(
            [
              field(
                `fov (lens is ${lens.fov})`,
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
          <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>lean toward subject</div>
          {grid(
            ["x", "y", "targetX", "targetY"].map((key) =>
              field(key, camera.follow[key], (v) =>
                onUpdate({ follow: { ...camera.follow, [key]: v } })
              )
            )
          )}
        </>
      ) : null}

      <OrbitSection
        camera={camera}
        rows={orbit}
        onUpdate={onUpdate}
        onUpdateRow={onUpdateOrbitRow}
        onAddRow={onAddOrbitRow}
        onRemoveRow={onRemoveOrbitRow}
      />

      <CameraPathSection
        camera={camera}
        rows={rows}
        onUpdate={onUpdate}
        onUpdateRow={onUpdateRow}
        onAddRow={onAddRow}
        onRemoveRow={onRemoveRow}
      />

      <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>pointer parallax</div>
      {grid(
        ["x", "y"].map((axis) =>
          field(axis, camera.parallax[axis], (v) =>
            onUpdate({ parallax: { ...camera.parallax, [axis]: v } })
          )
        )
      )}

      <div style={{ ...S.label, fontSize: 9, marginTop: 10 }}>damping</div>
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
 * The orbit: the product shot, in the terms the shot is actually described in.
 *
 * Three quarters on, slightly above, two metres out. Authoring the same move as
 * raw xyz means writing a circle by hand, and every keyframe slightly off the
 * radius shows up as the model lurching toward and away from the lens — the
 * commonest defect in a hand-built product shot, and one that is very hard to
 * see while you are the one nudging the numbers.
 */
function OrbitSection({ camera, rows, onUpdate, onUpdateRow, onAddRow, onRemoveRow }) {
  const on = camera.mode === "orbit";
  if (!on && rows.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #221f1d" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...S.label, flex: 1 }}>Orbit {on ? "" : "· not in use"}</span>
        <button onClick={onAddRow} title="Add an orbit waypoint here" style={S.chip}>
          + point
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {[
          ["target", "a fixed point"],
          ["subject", "the subject"],
        ].map(([which, title]) => (
          <button
            key={which}
            onClick={() => onUpdate({ orbitTarget: which })}
            title={`Circle ${title}`}
            style={{
              ...S.chip,
              padding: "3px 9px",
              background: camera.orbitTarget === which ? "#7ad9ff" : "#221f1d",
              color: camera.orbitTarget === which ? "#11100f" : "#efe6da",
            }}
          >
            circles: {title}
          </button>
        ))}
      </div>

      {camera.orbitTarget === "subject" ? (
        <div style={S.hint}>
          It circles whatever is flying the path. With the subject standing
          still, this is the whole product shot.
        </div>
      ) : (
        vector("circles around", camera.target, (next) => onUpdate({ target: next }))
      )}

      {rows.map((row, i) => (
        <div
          key={i}
          data-rossa-orbit-row={i}
          style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #221f1d" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ opacity: 0.45 }}>#{i}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {field("p", row.p, (v) => onUpdateRow(i, { p: v }), 0.005)}
              <button
                onClick={() => onRemoveRow(i)}
                title="Remove this orbit waypoint"
                style={{ ...S.chip, padding: "0 6px", background: "transparent", color: "#ff8b7a" }}
              >
                x
              </button>
            </span>
          </div>

          {grid(
            [
              field("around °", row.azimuth, (v) => onUpdateRow(i, { azimuth: v }), 5),
              field("above °", row.elevation, (v) => onUpdateRow(i, { elevation: v }), 2),
              field("distance", row.distance, (v) => onUpdateRow(i, { distance: v }), 0.2),
              field("fov", row.fov, (v) => onUpdateRow(i, { fov: v }), 0.5),
            ],
            4
          )}
        </div>
      ))}

      <div style={S.hint}>
        <b>around</b> is the angle you have walked round it — 0 is straight in
        front. <b>above</b> lifts the lens without changing how far away it is.
      </div>
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
  const [open, setOpen] = useState(false);
  const on = camera.mode === "path";
  if (!on && rows.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #221f1d" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...S.label, flex: 1 }}>Camera path {on ? "" : "· not in use"}</span>
        <button onClick={onAddRow} title="Add a camera waypoint here" style={S.chip}>
          + point
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title={open ? "Hide the rows" : "Show the rows"}
          data-rossa-camera-rows=""
          style={S.chip}
        >
          {open ? "▾" : "▸"} {rows.length}
        </button>
      </div>

      <div style={S.hint}>
        Pink handles are where the lens goes, blue ones what it looks at. Switch
        the camera to <b>free</b> to see them — in page view they sit at the eye
        you are looking through.
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
                ...S.chip,
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

      {open
        ? rows.map((row, i) => (
            <div
              key={i}
              data-rossa-camera-row={i}
              style={{ marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #221f1d" }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ opacity: 0.45 }}>#{i}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {field("p", row.p, (v) => onUpdateRow(i, { p: v }), 0.005)}
                  <button
                    onClick={() => onRemoveRow(i)}
                    title="Remove this camera waypoint"
                    style={{
                      ...S.chip,
                      padding: "0 6px",
                      background: "transparent",
                      color: "#ff8b7a",
                    }}
                  >
                    x
                  </button>
                </span>
              </div>

              {vector("position", row.position, (next) => onUpdateRow(i, { position: next }))}
              {camera.pathTarget === "subject"
                ? null
                : vector("looks at", row.target, (next) => onUpdateRow(i, { target: next }))}
              {grid([field("fov", row.fov, (v) => onUpdateRow(i, { fov: v }), 0.5)], 3)}
            </div>
          ))
        : null}
    </div>
  );
}
