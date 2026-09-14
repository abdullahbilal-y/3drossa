"use client";

import { useEffect, useState } from "react";

/**
 * The inspector: a timeline, a row per waypoint, and Save.
 *
 * Rendered into document.body rather than into the canvas container, so it sits
 * above both the page and the raised canvas regardless of how the host has
 * stacked them.
 */

const S = {
  panel: {
    // Absolute, not fixed: the editor portals this into its own fixed overlay,
    // so the overlay does the viewport pinning and this just fills its right
    // edge. Fixed would be measured against drei Html transformed wrapper.
    position: "absolute",
    top: 0,
    right: 0,
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
  doc,
  selection,
  onSelect,
  onUpdatePoint,
  onUpdateStationKey,
  onUpdateCamera,
  onSave,
  onCopy,
  status,
  dragging,
  freeCamera,
  onToggleCamera,
}) {
  const [progress, setProgress] = useState(0);

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

  const ranges = [...stage.journey.ranges.entries()];
  const active = ranges.find(([, r]) => progress >= r.from && progress <= r.to);

  return (
    <div style={{ ...S.panel, opacity: dragging ? 0.35 : 1 }}>
      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={S.label}>3drossa</span>
          <span style={{ ...S.label, letterSpacing: 0 }}>
            {progress.toFixed(3)} · {active ? active[0] : "travel"}
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
            {freeCamera ? "Free camera — drag to orbit" : "Preview: page camera"}
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
          <div style={S.label}>Stations</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {doc.stations.map((s) => {
              const on = selection?.kind === "station" && selection.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    onSelect(on ? null : { kind: "station", id: s.id, key: 0 })
                  }
                  style={{
                    ...S.button,
                    width: "auto",
                    padding: "4px 10px",
                    background: on ? "#9b6bff" : "#221f1d",
                    color: on ? "#11100f" : "#efe6da",
                  }}
                >
                  {s.id}
                </button>
              );
            })}
          </div>
          {selection?.kind === "station" ? (
            <StationEditor
              station={doc.stations.find((s) => s.id === selection.id)}
              selection={selection}
              onSelect={onSelect}
              onUpdate={onUpdateStationKey}
            />
          ) : null}
        </div>

        <CameraSection camera={doc.camera} onUpdate={onUpdateCamera} />

        <div style={S.label} className="rossa-heading">
          <div style={{ padding: "10px 14px 0" }}>Path</div>
        </div>

        {doc.path.map((point, i) => {
          const derived = point.station !== undefined;
          const on = selection?.kind === "path" && selection.index === i;
          const resolved = derived
            ? stage.journey.stationSubject(point.station, point.at)
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
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.45 }}>#{i}</span>
                {derived ? (
                  <span style={{ color: "#2e9d8f" }}>
                    {point.station} @ {point.at}
                  </span>
                ) : null}
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

        <button
          onClick={onSave}
          style={{ ...S.button, background: "#f5a623", color: "#11100f" }}
        >
          Save to journey.json
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

function StationEditor({ station, selection, onSelect, onUpdate }) {
  if (!station) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...S.label, fontSize: 9 }}>Subject keyframes</div>
      {station.subject.map((key, i) => {
        const on = selection.key === i;
        return (
          <div
            key={i}
            onClick={() => onSelect({ kind: "station", id: station.id, key: i })}
            style={{
              marginTop: 6,
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${on ? "#9b6bff" : "#221f1d"}`,
              cursor: "pointer",
            }}
          >
            <div style={{ opacity: 0.5, marginBottom: 4 }}>t = {key.t}</div>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
            >
              {["sx", "y", "z", "scale"].map((channel) => (
                <label key={channel}>
                  <div style={{ ...S.label, fontSize: 9 }}>{channel}</div>
                  <input
                    type="number"
                    step={0.01}
                    value={Number((key[channel] ?? 0).toFixed(3))}
                    onChange={(e) =>
                      onUpdate(station.id, "subject", i, {
                        [channel]: Number(e.target.value),
                      })
                    }
                    style={S.input}
                  />
                </label>
              ))}
            </div>
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
 * makes "the whole journey is one document" actually true - and "locked" with
 * stations off is the answer to the most common request of all: a camera that
 * simply does not move.
 */
function CameraSection({ camera, onUpdate }) {
  if (!camera) return null;

  const number = (label, value, onChange, step = 0.01) => (
    <label key={label} style={{ display: "block" }}>
      <div style={{ ...S.label, fontSize: 9 }}>{label}</div>
      <input
        type="number"
        step={step}
        value={Number((value ?? 0).toFixed(3))}
        onChange={(e) => onChange(Number(e.target.value))}
        style={S.input}
      />
    </label>
  );

  const grid = (children) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 6 }}>
      {children}
    </div>
  );

  return (
    <div style={{ ...S.section, borderBottom: "1px solid #2c2825" }}>
      <div style={S.label}>Camera</div>

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {["follow", "beats", "locked"].map((mode) => (
          <button
            key={mode}
            onClick={() => onUpdate({ mode })}
            title={
              mode === "follow"
                ? "Leans toward the subject"
                : mode === "beats"
                  ? "Follows the beats track only"
                  : "Never moves"
            }
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
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>position</div>
          {grid(
            ["x", "y", "z"].map((axis, i) =>
              number(axis, camera.position[i], (v) => {
                const next = [...camera.position];
                next[i] = v;
                onUpdate({ position: next });
              })
            )
          )}
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>looks at</div>
          {grid(
            ["x", "y", "z"].map((axis, i) =>
              number(axis, camera.target[i], (v) => {
                const next = [...camera.target];
                next[i] = v;
                onUpdate({ target: next });
              })
            )
          )}
        </>
      ) : null}

      {camera.mode === "follow" ? (
        <>
          <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>lean toward subject</div>
          {grid(
            ["x", "y", "targetX", "targetY"].map((key) =>
              number(key, camera.follow[key], (v) =>
                onUpdate({ follow: { ...camera.follow, [key]: v } })
              )
            )
          )}
        </>
      ) : null}

      <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>pointer parallax</div>
      {grid(
        ["x", "y"].map((axis) =>
          number(axis, camera.parallax[axis], (v) =>
            onUpdate({ parallax: { ...camera.parallax, [axis]: v } })
          )
        )
      )}

      <div style={{ ...S.label, fontSize: 9, marginTop: 8 }}>damping</div>
      {grid(
        ["position", "station", "parallax", "fov"].map((key) =>
          number(
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
