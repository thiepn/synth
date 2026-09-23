import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
} from "react";
import type { RhythmGlyphGeometry } from "../../visual/rhythmGlyph";

export type ModeId =
  | "create"
  | "sequence"
  | "sound"
  | "arrange"
  | "live"
  | "mix"
  | "archive";

export interface ModeDefinition {
  id: ModeId;
  number: string;
  label: string;
  phase: string;
}

export const MODES: ModeDefinition[] = [
  { id: "create", number: "01", label: "CREATE", phase: "FOUNDATION" },
  { id: "sequence", number: "02", label: "SEQUENCE", phase: "PHASE 4" },
  { id: "sound", number: "03", label: "SOUND", phase: "PHASE 11" },
  { id: "arrange", number: "04", label: "ARRANGE", phase: "PHASE 18" },
  { id: "live", number: "05", label: "LIVE", phase: "PHASE 23" },
  { id: "mix", number: "06", label: "MIX", phase: "PHASE 27" },
  { id: "archive", number: "07", label: "EXPORT", phase: "PHASE 28" },
];

interface MachineButtonProps {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

export function MachineButton({
  children,
  active = false,
  disabled = false,
  compact = false,
  onClick,
  ariaLabel,
}: MachineButtonProps) {
  return (
    <button
      type="button"
      className={[
        "machine-button",
        active ? "is-active" : "",
        compact ? "is-compact" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <span className="machine-button__edge" aria-hidden="true" />
      <span className="machine-button__label">{children}</span>
    </button>
  );
}

interface SignalRailProps {
  label: string;
  value: number;
  minLabel?: string;
  maxLabel?: string;
  tone?: "phosphor" | "heat" | "ice";
  onChange?: (next: number) => void;
}

export function SignalRail({
  label,
  value,
  minLabel = "00",
  maxLabel = "100",
  tone = "phosphor",
  onChange,
}: SignalRailProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <label className={"signal-rail signal-rail--" + tone}>
      <span className="signal-rail__header">
        <span>{label}</span>
        <output>{String(Math.round(clamped)).padStart(2, "0")}</output>
      </span>
      <span className="signal-rail__track">
        <span className="signal-rail__ticks" aria-hidden="true" />
        <span
          className="signal-rail__fill"
          style={{ "--rail-value": clamped / 100 } as CSSProperties}
          aria-hidden="true"
        />
        <input
          className="signal-rail__input"
          type="range"
          min="0"
          max="100"
          value={clamped}
          onChange={(event) => onChange?.(Number(event.currentTarget.value))}
          aria-label={label}
        />
      </span>
      <span className="signal-rail__ends" aria-hidden="true">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </span>
    </label>
  );
}

interface InstrumentStripProps {
  code: string;
  name: string;
  values: readonly number[];
  locked?: boolean;
  accent?: "phosphor" | "heat" | "ice";
  detail: string;
  activeStep?: number;
  lockDisabled?: boolean;
  onToggleLock?: () => void;
}

export function InstrumentStrip({
  code,
  name,
  values,
  locked = false,
  accent = "phosphor",
  detail,
  activeStep,
  lockDisabled = false,
  onToggleLock,
}: InstrumentStripProps) {
  return (
    <div className={"instrument-strip instrument-strip--" + accent}>
      <div className="instrument-strip__identity">
        <span className="instrument-strip__code">{code}</span>
        <strong>{name}</strong>
      </div>

      <div
        className="instrument-strip__pattern"
        style={{ "--step-count": Math.max(1, values.length) } as CSSProperties}
        aria-label={name + " rhythm preview"}
      >
        {values.map((value, index) => (
          <span
            key={index}
            className={[
              "hit",
              value > 0 ? "is-on" : "",
              activeStep === index ? "is-current" : "",
            ].join(" ")}
            style={{ "--hit-level": value } as CSSProperties}
          />
        ))}
      </div>

      <span className="instrument-strip__detail">{detail}</span>

      <button
        type="button"
        className={locked ? "lock-switch is-locked" : "lock-switch"}
        onClick={onToggleLock}
        disabled={lockDisabled}
        aria-pressed={locked}
        aria-label={
          lockDisabled
            ? name + " locking becomes active in Phase 6"
            : (locked ? "Unlock " : "Lock ") + name
        }
        title={lockDisabled ? "Lock / reroll arrives in Phase 6" : undefined}
      >
        <span className="lock-switch__lamp" aria-hidden="true" />
        <span>{lockDisabled ? "P6" : locked ? "LOCK" : "FREE"}</span>
      </button>
    </div>
  );
}

interface RhythmGlyphProps {
  geometry: RhythmGlyphGeometry;
  label?: string;
  compact?: boolean;
}

export function RhythmGlyph({
  geometry,
  label = "Rhythm glyph",
  compact = false,
}: RhythmGlyphProps) {
  return (
    <svg
      className={compact ? "rhythm-glyph is-compact" : "rhythm-glyph"}
      viewBox="0 0 200 100"
      role="img"
      aria-label={label}
      data-signature={geometry.signature}
    >
      <path
        className="rhythm-glyph__axis"
        d={geometry.axisPath}
        aria-hidden="true"
      />
      <path
        className="rhythm-glyph__contour rhythm-glyph__contour--upper"
        d={geometry.upperPath}
        aria-hidden="true"
      />
      <path
        className="rhythm-glyph__contour rhythm-glyph__contour--lower"
        d={geometry.lowerPath}
        aria-hidden="true"
      />
      <path
        className="rhythm-glyph__main"
        d={geometry.mainPath}
        aria-hidden="true"
      />

      {geometry.ticks.map((tick, index) => (
        <line
          key={
            tick.kind +
            ":" +
            index +
            ":" +
            tick.x1.toFixed(2) +
            ":" +
            tick.y1.toFixed(2)
          }
          className={
            "rhythm-glyph__tick rhythm-glyph__tick--" + tick.kind
          }
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          strokeWidth={0.55 + tick.strength * 0.8}
          aria-hidden="true"
        />
      ))}

      {geometry.nodes.map((node, index) =>
        node.kind === "kick" ? (
          <rect
            key={"kick:" + index + ":" + node.x.toFixed(2)}
            className="rhythm-glyph__node rhythm-glyph__node--kick"
            x={node.x - node.radius}
            y={node.y - node.radius}
            width={node.radius * 2}
            height={node.radius * 2}
            transform={
              "rotate(45 " + node.x.toFixed(2) + " " + node.y.toFixed(2) + ")"
            }
            aria-hidden="true"
          />
        ) : (
          <circle
            key={node.kind + ":" + index + ":" + node.x.toFixed(2)}
            className={
              "rhythm-glyph__node rhythm-glyph__node--" + node.kind
            }
            cx={node.x}
            cy={node.y}
            r={node.radius}
            aria-hidden="true"
          />
        ),
      )}
    </svg>
  );
}

interface BeatReactorProps {
  seed: string;
  distance: number;
  generationVersion: number;
  actionLabel: "GENERATE" | "REROLL";
  onAction: () => void;
  onDistanceChange: (next: number) => void;
}

export function BeatReactor({
  seed,
  distance,
  generationVersion,
  actionLabel,
  onAction,
  onDistanceChange,
}: BeatReactorProps) {
  return (
    <div
      className="beat-reactor"
      style={{ "--reactor-similarity": distance / 100 } as CSSProperties}
    >
      <div className="beat-reactor__caption">
        <span>BEAT / REACTOR</span>
        <span>GEN / DERIVE</span>
      </div>

      <div className="beat-reactor__machine">
        <span className="beat-reactor__orbit beat-reactor__orbit--outer" aria-hidden="true" />
        <span className="beat-reactor__orbit beat-reactor__orbit--inner" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--north" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--east" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--south" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--west" aria-hidden="true" />

        <button
          key={generationVersion}
          type="button"
          className="beat-reactor__core"
          onClick={onAction}
          aria-label={actionLabel === "GENERATE" ? "Generate a new beat" : "Reroll unlocked beat lanes"}
        >
          <span className="beat-reactor__seed">{seed}</span>
          <span className="beat-reactor__pulse-dot" aria-hidden="true" />
          <span className="beat-reactor__action">{actionLabel}</span>
        </button>
      </div>

      <label className="beat-reactor__distance">
        <span>SAME</span>
        <input
          type="range"
          min="0"
          max="100"
          value={distance}
          onChange={(event) =>
            onDistanceChange(Number(event.currentTarget.value))
          }
          aria-label="Reroll change distance"
        />
        <span>WILD</span>
      </label>
    </div>
  );
}

interface GrooveFieldProps {
  x: number;
  y: number;
  labels?: {
    nw: string;
    ne: string;
    sw: string;
    se: string;
  };
  onChange: (x: number, y: number) => void;
  onCommit?: (x: number, y: number) => void;
}

export function GrooveField({
  x,
  y,
  labels = {
    nw: "BUSY",
    ne: "MOTION",
    sw: "STRAIGHT",
    se: "SPARSE",
  },
  onChange,
  onCommit,
}: GrooveFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const pointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): { x: number; y: number } | null => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: Math.max(
        0,
        Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
      ),
      y: Math.max(
        0,
        Math.min(
          100,
          (1 - (event.clientY - rect.top) / rect.height) * 100,
        ),
      ),
    };
  };

  const setFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFromPointer(event);
    if (!point) return null;
    onChange(point.x, point.y);
    return point;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const amount = event.shiftKey ? 10 : 2;
    let nextX = x;
    let nextY = y;

    if (event.key === "ArrowLeft") nextX -= amount;
    else if (event.key === "ArrowRight") nextX += amount;
    else if (event.key === "ArrowDown") nextY -= amount;
    else if (event.key === "ArrowUp") nextY += amount;
    else return;

    event.preventDefault();
    const committedX = Math.max(0, Math.min(100, nextX));
    const committedY = Math.max(0, Math.min(100, nextY));
    onChange(committedX, committedY);
    onCommit?.(committedX, committedY);
  };

  return (
    <div className="groove-field-shell">
      <div className="groove-field-shell__header">
        <span>GROOVE / FIELD</span>
        <span>
          {Math.round(x).toString().padStart(2, "0")}:
          {Math.round(y).toString().padStart(2, "0")}
        </span>
      </div>

      <div
        ref={fieldRef}
        className="groove-field"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            setFromPointer(event);
          }
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }

          const point = setFromPointer(event);
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (point) onCommit?.(point.x, point.y);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        <span className="groove-field__grid" aria-hidden="true" />
        <span className="groove-field__label groove-field__label--nw">{labels.nw}</span>
        <span className="groove-field__label groove-field__label--ne">{labels.ne}</span>
        <span className="groove-field__label groove-field__label--sw">{labels.sw}</span>
        <span className="groove-field__label groove-field__label--se">{labels.se}</span>
        <button
          type="button"
          className="groove-field__cursor"
          style={{ left: x + "%", bottom: y + "%" }}
          onKeyDown={handleKeyDown}
          aria-label={
            "Groove field. Horizontal " +
            Math.round(x) +
            ", vertical " +
            Math.round(y) +
            ". Use arrow keys to adjust."
          }
        >
          <span aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface PulseSpineProps {
  active?: boolean;
  density?: number;
}

export function PulseSpine({ active = false, density = 58 }: PulseSpineProps) {
  return (
    <div className={active ? "pulse-spine is-active" : "pulse-spine"}>
      <span className="pulse-spine__lead" aria-hidden="true" />
      <span
        className="pulse-spine__node"
        style={{ left: Math.max(4, Math.min(96, density)) + "%" }}
        aria-hidden="true"
      />
      <span className="pulse-spine__tail" aria-hidden="true" />
    </div>
  );
}
