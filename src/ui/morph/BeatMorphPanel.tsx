import { useMemo, useState } from "react";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  deriveBeatRemix,
  styleIdForPattern,
  type BeatMorphDimensions,
} from "../../generation/beatMorphEngine";
import type {
  BeatGenerationIntent,
  BeatStyleId,
} from "../../generation/beatGenerator";
import { generationHistoryStore } from "../../history/GenerationHistoryStore";
import {
  beatMorphStore,
} from "../../morph/BeatMorphStore";
import { useBeatMorphSnapshot } from "../../morph/useBeatMorph";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import { getStyleDNA } from "../../style/styleDNA";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  MachineButton,
  RhythmGlyph,
  SignalRail,
} from "../pulse/Primitives";

interface BeatMorphPanelProps {
  targetStyle: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}

function patternStyleLabel(
  style: BeatStyleId | undefined,
): string {
  return style
    ? getStyleDNA(style).label
    : "MIXED / MANUAL";
}

function percent(value: number): string {
  return String(Math.round(value * 100)).padStart(3, "0");
}

export function BeatMorphPanel({
  targetStyle,
  intent,
  bpm,
}: BeatMorphPanelProps) {
  const workspace = useBeatMorphSnapshot();
  const sequencer = useSequencerSnapshot();
  const transport = useTransportSnapshot();
  const [remixStrength, setRemixStrength] = useState(64);
  const [remixCounter, setRemixCounter] = useState(0);
  const [status, setStatus] = useState("READY / CAPTURE A");

  const aGeometry = useMemo(
    () =>
      workspace.a
        ? deriveRhythmGlyph(workspace.a)
        : undefined,
    [workspace.a],
  );
  const bGeometry = useMemo(
    () =>
      workspace.b
        ? deriveRhythmGlyph(workspace.b)
        : undefined,
    [workspace.b],
  );
  const previewGeometry = useMemo(
    () =>
      workspace.preview
        ? deriveRhythmGlyph(workspace.preview.pattern)
        : undefined,
    [workspace.preview],
  );

  const styleA = workspace.a
    ? styleIdForPattern(workspace.a)
    : undefined;
  const styleB = workspace.b
    ? styleIdForPattern(workspace.b)
    : undefined;

  const dimensionValues = Object.values(
    workspace.dimensions,
  );
  const master =
    dimensionValues.reduce((sum, value) => sum + value, 0) /
    dimensionValues.length;
  const dimensionSpread =
    Math.max(...dimensionValues) -
    Math.min(...dimensionValues);

  const captureA = () => {
    beatMorphStore.captureA(sequencer.pattern);
    setStatus("A CAPTURED / " + sequencer.pattern.name);
  };

  const captureB = () => {
    try {
      beatMorphStore.captureB(sequencer.pattern);
      setStatus("B CAPTURED / " + sequencer.pattern.name);
    } catch (error) {
      setStatus(
        "B REJECTED / " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const deriveRemixB = () => {
    const source = workspace.a ?? sequencer.pattern;

    try {
      if (!workspace.a) {
        beatMorphStore.captureA(source);
      }

      const result = deriveBeatRemix({
        source,
        seed:
          "remix-workspace:" +
          source.id +
          ":" +
          targetStyle +
          ":" +
          String(remixCounter).padStart(4, "0"),
        targetStyle,
        intent,
        amount: remixStrength / 100,
        bpm,
      });
      setRemixCounter((value) => value + 1);

      if (!result.accepted) {
        setStatus(
          "REMIX REJECTED / Q" +
            result.validation.score +
            " / " +
            (result.validation.reasons[0] ?? "QUALITY"),
        );
        return;
      }

      beatMorphStore.captureB(result.pattern, "remix");
      setStatus(
        "REMIX B / " +
          getStyleDNA(targetStyle).code +
          " / Q" +
          result.validation.score +
          " / Δ" +
          result.changedStepCount,
      );
    } catch (error) {
      setRemixCounter((value) => value + 1);
      setStatus(
        "REMIX ERROR / " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const audition = (
    pattern:
      | typeof sequencer.pattern
      | undefined,
    label: string,
  ) => {
    if (!pattern || transport.status === "running") return;

    void drumEngine.auditionPattern(pattern, bpm);
    setStatus("AUDITION / " + label);
  };

  const commitPattern = (
    pattern: typeof sequencer.pattern,
    operation: "beatMorph" | "remix",
    label: string,
  ) => {
    const source = workspace.a ?? sequencer.pattern;
    const prepared =
      generationHistoryStore.prepareCreativePattern(
        source,
        pattern,
      );

    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;

    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      operation,
      label,
      applied.name,
    );

    setStatus(
      label +
        " COMMITTED / RG-" +
        deriveRhythmGlyph(applied).signature.slice(0, 6),
    );
  };

  const setDimension = (
    key: keyof BeatMorphDimensions,
    value: number,
  ) => {
    beatMorphStore.setDimension(key, value / 100);
  };

  return (
    <section
      className="beat-morph-panel"
      aria-labelledby="beat-morph-title"
    >
      <div className="machine-section-label">
        <span id="beat-morph-title">BEAT / MORPH + REMIX</span>
        <span>NON-DESTRUCTIVE A/B WORKSPACE / V1</span>
      </div>

      <div className="beat-morph-machine">
        <div className="beat-morph-endpoint">
          <div className="beat-morph-endpoint__head">
            <span>A / SOURCE</span>
            <strong>
              {workspace.a?.name ?? "NO SOURCE"}
            </strong>
            <small>
              {workspace.a
                ? patternStyleLabel(styleA)
                : "CAPTURE CURRENT"}
            </small>
          </div>

          <div className="beat-morph-endpoint__glyph">
            {aGeometry ? (
              <RhythmGlyph
                geometry={aGeometry}
                compact
                label="Beat Morph endpoint A"
              />
            ) : (
              <span>RG / EMPTY</span>
            )}
          </div>

          <div className="beat-morph-endpoint__meta">
            <span>
              {aGeometry
                ? "RG-" + aGeometry.signature.slice(0, 6)
                : "---"}
            </span>
            <span>
              {workspace.aOrigin?.toUpperCase() ?? "---"}
            </span>
          </div>

          <div className="beat-morph-endpoint__actions">
            <MachineButton compact onClick={captureA}>
              CAPTURE A
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !workspace.a ||
                transport.status === "running"
              }
              onClick={() => audition(workspace.a, "A")}
            >
              ▶ A
            </MachineButton>
          </div>
        </div>

        <div className="beat-morph-core">
          <div className="beat-morph-core__head">
            <span>
              A {patternStyleLabel(styleA)}
            </span>
            <strong>
              {dimensionSpread < 0.02
                ? "MORPH " + percent(master)
                : "CUSTOM VECTOR"}
            </strong>
            <span>
              B {patternStyleLabel(styleB)}
            </span>
          </div>

          <SignalRail
            label="MORPH ALL"
            value={master * 100}
            minLabel="A"
            maxLabel="B"
            tone="ice"
            onChange={(value) =>
              beatMorphStore.setAll(value / 100)
            }
          />

          <div className="beat-morph-dimensions">
            <SignalRail
              label="RHYTHM"
              value={workspace.dimensions.rhythm * 100}
              minLabel="A"
              maxLabel="B"
              onChange={(value) =>
                setDimension("rhythm", value)
              }
            />
            <SignalRail
              label="DYNAMICS"
              value={workspace.dimensions.dynamics * 100}
              minLabel="A"
              maxLabel="B"
              tone="heat"
              onChange={(value) =>
                setDimension("dynamics", value)
              }
            />
            <SignalRail
              label="TIMING"
              value={workspace.dimensions.timing * 100}
              minLabel="A"
              maxLabel="B"
              tone="ice"
              onChange={(value) =>
                setDimension("timing", value)
              }
            />
            <SignalRail
              label="GROOVE"
              value={workspace.dimensions.groove * 100}
              minLabel="A"
              maxLabel="B"
              onChange={(value) =>
                setDimension("groove", value)
              }
            />
            <SignalRail
              label="STYLE DNA"
              value={workspace.dimensions.styleDNA * 100}
              minLabel="A"
              maxLabel="B"
              tone="ice"
              onChange={(value) =>
                setDimension("styleDNA", value)
              }
            />
          </div>

          <div className="beat-morph-preview">
            <div className="beat-morph-preview__glyph">
              {previewGeometry ? (
                <RhythmGlyph
                  geometry={previewGeometry}
                  compact
                  label="Current Beat Morph preview"
                />
              ) : (
                <span>CAPTURE A + B</span>
              )}
            </div>

            <dl className="beat-morph-preview__metrics">
              <div>
                <dt>DIST / A</dt>
                <dd>
                  {workspace.preview
                    ? percent(
                        workspace.preview.distanceFromA.total,
                      )
                    : "---"}
                </dd>
              </div>
              <div>
                <dt>DIST / B</dt>
                <dd>
                  {workspace.preview
                    ? percent(
                        workspace.preview.distanceFromB.total,
                      )
                    : "---"}
                </dd>
              </div>
              <div>
                <dt>SHARED</dt>
                <dd>
                  {workspace.preview?.sharedEventCount ?? "--"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="beat-morph-core__actions">
            <MachineButton
              compact
              disabled={!workspace.a || !workspace.b}
              onClick={() => beatMorphStore.swap()}
            >
              A ↔ B
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !workspace.preview ||
                transport.status === "running"
              }
              onClick={() =>
                audition(
                  workspace.preview?.pattern,
                  "MORPH",
                )
              }
            >
              ▶ MORPH
            </MachineButton>
            <MachineButton
              disabled={!workspace.preview}
              onClick={() =>
                workspace.preview
                  ? commitPattern(
                      workspace.preview.pattern,
                      "beatMorph",
                      "MORPH",
                    )
                  : undefined
              }
            >
              COMMIT MORPH
            </MachineButton>
          </div>
        </div>

        <div className="beat-morph-endpoint beat-morph-endpoint--b">
          <div className="beat-morph-endpoint__head">
            <span>B / TARGET</span>
            <strong>
              {workspace.b?.name ?? "NO TARGET"}
            </strong>
            <small>
              {workspace.b
                ? patternStyleLabel(styleB)
                : "CAPTURE OR REMIX"}
            </small>
          </div>

          <div className="beat-morph-endpoint__glyph">
            {bGeometry ? (
              <RhythmGlyph
                geometry={bGeometry}
                compact
                label="Beat Morph endpoint B"
              />
            ) : (
              <span>RG / EMPTY</span>
            )}
          </div>

          <div className="beat-morph-endpoint__meta">
            <span>
              {bGeometry
                ? "RG-" + bGeometry.signature.slice(0, 6)
                : "---"}
            </span>
            <span>
              {workspace.bOrigin?.toUpperCase() ?? "---"}
            </span>
          </div>

          <div className="beat-morph-endpoint__actions">
            <MachineButton compact onClick={captureB}>
              CAPTURE B
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !workspace.b ||
                transport.status === "running"
              }
              onClick={() => audition(workspace.b, "B")}
            >
              ▶ B
            </MachineButton>
          </div>

          <div className="beat-remix-control">
            <div className="beat-remix-control__target">
              <span>REMIX TARGET</span>
              <strong>
                {getStyleDNA(targetStyle).code} /{" "}
                {getStyleDNA(targetStyle).label}
              </strong>
            </div>

            <SignalRail
              label="REMIX STRENGTH"
              value={remixStrength}
              minLabel="RELATED"
              maxLabel="REBUILD"
              tone="heat"
              onChange={setRemixStrength}
            />

            <MachineButton onClick={deriveRemixB}>
              REMIX → B
            </MachineButton>

            <MachineButton
              compact
              disabled={
                !workspace.b ||
                workspace.bOrigin !== "remix"
              }
              onClick={() =>
                workspace.b
                  ? commitPattern(
                      workspace.b,
                      "remix",
                      "REMIX",
                    )
                  : undefined
              }
            >
              COMMIT REMIX
            </MachineButton>
          </div>
        </div>
      </div>

      <div
        className="beat-morph-status"
        aria-live="polite"
      >
        <span>{status}</span>
        <strong>
          RHY {percent(workspace.dimensions.rhythm)} · DYN{" "}
          {percent(workspace.dimensions.dynamics)} · TIM{" "}
          {percent(workspace.dimensions.timing)} · GRV{" "}
          {percent(workspace.dimensions.groove)} · DNA{" "}
          {percent(workspace.dimensions.styleDNA)}
        </strong>
        <button
          type="button"
          onClick={() => {
            beatMorphStore.clear();
            setStatus("READY / CAPTURE A");
          }}
        >
          CLEAR
        </button>
      </div>

      <p className="beat-morph-note">
        Preview, Remix derivation and slider movement are non-destructive.
        COMMIT creates one normal editable Pattern branch in the Evolution
        Tree. A/B endpoints currently require matching meter and Pattern
        length.
      </p>
    </section>
  );
}
