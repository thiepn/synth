import { useEffect, useMemo, useState } from "react";
import type {
  ArrangementShapeId,
  SceneRole,
} from "../../domain/contracts";
import {
  arrangementFoundationStore,
} from "../../arrange/ArrangementFoundationStore";
import { useArrangementFoundationSnapshot } from "../../arrange/useArrangementFoundation";
import { useBeatFamilySnapshot } from "../../family/useBeatFamily";
import { generateSceneSectionBlueprint } from "../../generation/sceneSectionGenerator";
import { PPQ } from "../../domain/contracts";
import { MachineButton } from "../pulse/Primitives";

const SHAPES: readonly {
  id: ArrangementShapeId;
  label: string;
  code: string;
  detail: string;
}[] = [
  {
    id: "compact",
    label: "COMPACT",
    code: "CMP",
    detail: "7 sections / short-form arc",
  },
  {
    id: "standard",
    label: "STANDARD",
    code: "STD",
    detail: "11 sections / full song arc",
  },
  {
    id: "extended",
    label: "EXTENDED",
    code: "EXT",
    detail: "12 sections / long-form development",
  },
];

function roleCode(role: SceneRole): string {
  switch (role) {
    case "intro": return "INT";
    case "verse": return "VRS";
    case "preChorus": return "PRE";
    case "chorus": return "CHR";
    case "breakdown": return "BRK";
    case "build": return "BLD";
    case "drop": return "DRP";
    case "outro": return "OUT";
  }
}

export function ArrangeFoundationPanel() {
  const family = useBeatFamilySnapshot();
  const foundation = useArrangementFoundationSnapshot();
  const [shape, setShape] =
    useState<ArrangementShapeId>("standard");
  const [counter, setCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const familyId = family.family?.id;

  useEffect(() => {
    if (
      foundation.blueprint &&
      foundation.blueprint.familyId !== familyId
    ) {
      arrangementFoundationStore.clear();
    }
  }, [familyId, foundation.blueprint]);

  const patternLabelById = useMemo(
    () =>
      new Map(
        family.patterns.map((entry) => [
          entry.pattern.id,
          entry.label,
        ]),
      ),
    [family.patterns],
  );

  const sceneById = useMemo(
    () =>
      new Map(
        (foundation.blueprint?.scenes ?? []).map((scene) => [
          scene.id,
          scene,
        ]),
      ),
    [foundation.blueprint],
  );

  const selectedSection =
    foundation.blueprint?.sections.find(
      (section) => section.id === foundation.selectedSectionId,
    ) ?? foundation.blueprint?.sections[0];

  const generate = () => {
    if (!family.family || family.patterns.length === 0) {
      setError("Generate a Beat Family before creating section scenes.");
      return;
    }

    try {
      const result = generateSceneSectionBlueprint({
        family: family.family,
        patterns: family.patterns,
        shape,
        seed:
          "arrange-foundation:" +
          family.family.id +
          ":" +
          shape +
          ":" +
          String(counter).padStart(4, "0"),
      });

      setCounter((value) => value + 1);

      if (!result.valid) {
        setError(
          "Foundation rejected · Q" +
            result.coherenceScore +
            " · " +
            (result.reasons[0] ?? "section coherence gate failed"),
        );
        return;
      }

      arrangementFoundationStore.apply(result);
      setError(null);
    } catch (caught) {
      setCounter((value) => value + 1);
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const totalBeats =
    (foundation.totalTicks ?? 0) / PPQ;

  return (
    <section
      className="arrange-foundation-panel"
      aria-labelledby="arrange-foundation-title"
    >
      <div className="machine-section-label">
        <span id="arrange-foundation-title">ARRANGE / FOUNDATION</span>
        <span>SCENES + SECTIONS / V1</span>
      </div>

      <div className="arrange-foundation-control">
        <div className="arrange-shape-bank">
          {SHAPES.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={
                shape === entry.id
                  ? "arrange-shape-key is-active"
                  : "arrange-shape-key"
              }
              onClick={() => {
                setShape(entry.id);
                setError(null);
              }}
              aria-pressed={shape === entry.id}
              title={entry.detail}
            >
              <span>{entry.code}</span>
              <strong>{entry.label}</strong>
            </button>
          ))}
        </div>

        <div className="arrange-foundation-identity">
          <span>SOURCE FAMILY</span>
          <strong>{family.family?.name ?? "NO FAMILY"}</strong>
          <small>
            {foundation.blueprint
              ? foundation.blueprint.name
              : "SELECT SHAPE + GENERATE"}
          </small>
        </div>

        <dl className="arrange-foundation-summary">
          <div>
            <dt>SECTIONS</dt>
            <dd>{foundation.blueprint?.sections.length ?? "--"}</dd>
          </div>
          <div>
            <dt>SCENES</dt>
            <dd>{foundation.blueprint?.scenes.length ?? "--"}</dd>
          </div>
          <div>
            <dt>BEATS</dt>
            <dd>
              {foundation.totalTicks === undefined
                ? "--"
                : Math.round(totalBeats)}
            </dd>
          </div>
          <div>
            <dt>QUALITY</dt>
            <dd>
              {foundation.coherenceScore === undefined
                ? "--"
                : foundation.coherenceScore}
            </dd>
          </div>
        </dl>

        <div className="arrange-foundation-actions">
          <MachineButton
            disabled={!family.family}
            onClick={generate}
          >
            GENERATE FOUNDATION
          </MachineButton>
          <MachineButton
            disabled={!foundation.blueprint}
            onClick={() => arrangementFoundationStore.clear()}
          >
            CLEAR
          </MachineButton>
        </div>
      </div>

      {error ? (
        <p className="arrange-foundation-error" aria-live="polite">
          {error}
        </p>
      ) : null}

      {foundation.blueprint ? (
        <>
          <div className="scene-roster">
            {foundation.blueprint.scenes.map((scene) => (
              <div className="scene-roster__item" key={scene.id}>
                <div>
                  <span>{scene.role ? roleCode(scene.role) : "---"}</span>
                  <strong>{scene.name}</strong>
                </div>
                <div className="scene-roster__energy">
                  <i
                    style={{
                      width: Math.round(scene.energy * 100) + "%",
                    }}
                  />
                </div>
                <small>
                  E{Math.round(scene.energy * 100)} ·{" "}
                  {scene.patternIds
                    .map(
                      (patternId) =>
                        patternLabelById.get(patternId) ?? "?",
                    )
                    .join(" / ")}
                </small>
              </div>
            ))}
          </div>

          <div className="section-blueprint-list">
            {foundation.blueprint.sections.map((section, index) => {
              const selected =
                section.id === foundation.selectedSectionId;
              const scene = sceneById.get(section.sceneId);

              return (
                <button
                  type="button"
                  className={
                    selected
                      ? "section-blueprint-row is-selected"
                      : "section-blueprint-row"
                  }
                  key={section.id}
                  onClick={() =>
                    arrangementFoundationStore.selectSection(section.id)
                  }
                >
                  <span className="section-blueprint-row__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="section-blueprint-row__identity">
                    <b>{section.label}</b>
                    <small>
                      {scene?.role
                        ? roleCode(scene.role)
                        : section.role.toUpperCase()}
                    </small>
                  </span>

                  <span className="section-blueprint-row__sequence">
                    {section.patternSequence.map((patternId, cycle) => (
                      <i key={patternId + ":" + cycle}>
                        {patternLabelById.get(patternId) ?? "?"}
                      </i>
                    ))}
                  </span>

                  <span className="section-blueprint-row__route">
                    {section.fillPatternId ? "FILL " : ""}
                    {section.transitionPatternId ? "→ TRN" : ""}
                    {!section.fillPatternId &&
                    !section.transitionPatternId
                      ? "DIRECT"
                      : ""}
                  </span>

                  <span className="section-blueprint-row__energy">
                    <b>{Math.round(section.energyStart * 100)}</b>
                    <i>
                      <span
                        style={{
                          left:
                            Math.round(section.energyStart * 100) + "%",
                          right:
                            100 -
                            Math.round(section.energyEnd * 100) +
                            "%",
                        }}
                      />
                    </i>
                    <b>{Math.round(section.energyEnd * 100)}</b>
                  </span>

                  <span className="section-blueprint-row__duration">
                    <b>{section.cycleCount}</b>
                    <small>CYC</small>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSection ? (
            <div className="arrange-foundation-selected">
              <div>
                <span>SELECTED</span>
                <strong>{selectedSection.label}</strong>
              </div>
              <div>
                <span>START</span>
                <strong>{selectedSection.startTick}</strong>
              </div>
              <div>
                <span>LENGTH</span>
                <strong>{selectedSection.lengthTicks}</strong>
              </div>
              <div>
                <span>ENERGY</span>
                <strong>
                  {Math.round(selectedSection.energyStart * 100)}
                  {" → "}
                  {Math.round(selectedSection.energyEnd * 100)}
                </strong>
              </div>
              <div>
                <span>ROUTE</span>
                <strong>
                  {selectedSection.transitionPatternId
                    ? "TRANSITION"
                    : selectedSection.fillPatternId
                      ? "FILL"
                      : "DIRECT"}
                </strong>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="arrange-foundation-empty">
          <span>NO SECTION FOUNDATION</span>
          <strong>
            Generate a Compact, Standard or Extended section arc from the
            current Beat Family. Phase 18 will turn this data into the editable
            ARRANGE timeline.
          </strong>
        </div>
      )}

      <p className="arrange-foundation-note">
        Scene/Section generation is non-destructive and session-local. It
        creates real Scene and SectionBlueprint domain objects, but it does not
        yet start arrangement playback or replace the current Pattern.
      </p>
    </section>
  );
}
