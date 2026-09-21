import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
} from "react";

export type ModeId =
  | "create"
  | "sequence"
  | "sound"
  | "arrange"
  | "live"
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
  { id: "live", number: "05", label: "LIVE", phase: "PHASE 26" },
  { id: "archive", number: "06", label: "ARCHIVE", phase: "PHASE 28" },
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
  values: number[];
  locked?: boolean;
  accent?: "phosphor" | "heat" | "ice";
  detail: string;
  onToggleLock?: () => void;
}

export function InstrumentStrip({
  code,
  name,
  values,
  locked = false,
  accent = "phosphor",
  detail,
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
        aria-label={name + " rhythm preview"}
      >
        {values.map((value, index) => (
          <span
            key={index}
            className={value > 0 ? "hit is-on" : "hit"}
            style={{ "--hit-level": value } as CSSProperties}
          />
        ))}
      </div>

      <span className="instrument-strip__detail">{detail}</span>

      <button
        type="button"
        className={locked ? "lock-switch is-locked" : "lock-switch"}
        onClick={onToggleLock}
        aria-pressed={locked}
        aria-label={(locked ? "Unlock " : "Lock ") + name}
      >
        <span className="lock-switch__lamp" aria-hidden="true" />
        <span>{locked ? "LOCK" : "FREE"}</span>
      </button>
    </div>
  );
}

interface RhythmGlyphProps {
  variant?: number;
  label?: string;
}

const glyphPaths = [
  "M20 50 H64 L76 35 H116 L130 50 H180 M48 25 V76 M94 18 V83 M150 28 V72 M64 50 L82 67 M116 50 L137 31",
  "M18 51 H57 L72 29 H103 L121 51 H181 M39 30 V72 M88 19 V82 M145 23 V76 M57 51 L76 70 M121 51 L142 33",
  "M20 52 H52 L69 36 H101 L116 22 L134 52 H180 M44 25 V78 M84 31 V69 M151 26 V75 M52 52 L71 69 M134 52 L153 35",
];

export function RhythmGlyph({ variant = 0, label = "Rhythm glyph" }: RhythmGlyphProps) {
  const path = glyphPaths[Math.abs(variant) % glyphPaths.length];

  return (
    <svg
      className="rhythm-glyph"
      viewBox="0 0 200 100"
      role="img"
      aria-label={label}
    >
      <path className="rhythm-glyph__ghost" d={path} />
      <path className="rhythm-glyph__main" d={path} />
      <circle className="rhythm-glyph__node" cx="94" cy="50" r="3" />
    </svg>
  );
}

interface BeatReactorProps {
  seed: string;
  similarity: number;
  pulseVersion: number;
  onPulse: () => void;
  onSimilarityChange: (next: number) => void;
}

export function BeatReactor({
  seed,
  similarity,
  pulseVersion,
  onPulse,
  onSimilarityChange,
}: BeatReactorProps) {
  return (
    <div
      className="beat-reactor"
      style={{ "--reactor-similarity": similarity / 100 } as CSSProperties}
    >
      <div className="beat-reactor__caption">
        <span>BEAT / REACTOR</span>
        <span>UI CORE</span>
      </div>

      <div className="beat-reactor__machine">
        <span className="beat-reactor__orbit beat-reactor__orbit--outer" aria-hidden="true" />
        <span className="beat-reactor__orbit beat-reactor__orbit--inner" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--north" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--east" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--south" aria-hidden="true" />
        <span className="beat-reactor__marker beat-reactor__marker--west" aria-hidden="true" />

        <button
          key={pulseVersion}
          type="button"
          className="beat-reactor__core"
          onClick={onPulse}
          aria-label="Pulse the Beat Reactor visual preview"
        >
          <span className="beat-reactor__seed">{seed}</span>
          <span className="beat-reactor__pulse-dot" aria-hidden="true" />
          <span className="beat-reactor__action">PULSE</span>
        </button>
      </div>

      <label className="beat-reactor__distance">
        <span>SAME</span>
        <input
          type="range"
          min="0"
          max="100"
          value={similarity}
          onChange={(event) =>
            onSimilarityChange(Number(event.currentTarget.value))
          }
          aria-label="Generation change distance"
        />
        <span>WILD</span>
      </label>
    </div>
  );
}

interface GrooveFieldProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
}

export function GrooveField({ x, y, onChange }: GrooveFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const setFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;

    const nextX = ((event.clientX - rect.left) / rect.width) * 100;
    const nextY = (1 - (event.clientY - rect.top) / rect.height) * 100;
    onChange(
      Math.max(0, Math.min(100, nextX)),
      Math.max(0, Math.min(100, nextY)),
    );
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
    onChange(
      Math.max(0, Math.min(100, nextX)),
      Math.max(0, Math.min(100, nextY)),
    );
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
      >
        <span className="groove-field__grid" aria-hidden="true" />
        <span className="groove-field__label groove-field__label--nw">BUSY</span>
        <span className="groove-field__label groove-field__label--ne">MOTION</span>
        <span className="groove-field__label groove-field__label--sw">STRAIGHT</span>
        <span className="groove-field__label groove-field__label--se">SPARSE</span>
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
