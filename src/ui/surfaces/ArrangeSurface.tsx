import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { PPQ, type SceneRole } from "../../domain/contracts";
import {
  arrangementStore,
} from "../../arrange/ArrangementStore";
import {
  arrangementPlaybackStore,
} from "../../arrange/ArrangementPlaybackStore";
import {
  useArrangementPlaybackSnapshot,
  useArrangementSnapshot,
} from "../../arrange/useArrangement";
import { useArrangementFoundationSnapshot } from "../../arrange/useArrangementFoundation";
import { useBeatFamilySnapshot } from "../../family/useBeatFamily";
import { SignalRail, MachineButton } from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

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

function transitionLabel(
  value: "off" | "replaceLast" | "append" | undefined,
): string {
  if (value === "replaceLast") return "TRN / REPLACE";
  if (value === "append") return "TRN / APPEND";
  return "TRN / OFF";
}

const ROLE_OPTIONS: ReadonlyArray<{
  id: SceneRole;
  label: string;
}> = [
  { id: "intro", label: "Intro" },
  { id: "verse", label: "Verse" },
  { id: "preChorus", label: "Pre-Chorus" },
  { id: "chorus", label: "Chorus" },
  { id: "breakdown", label: "Breakdown" },
  { id: "build", label: "Build" },
  { id: "drop", label: "Drop" },
  { id: "outro", label: "Outro" },
];

export function ArrangeSurface() {
  const foundation = useArrangementFoundationSnapshot();
  const family = useBeatFamilySnapshot();
  const arrangement = useArrangementSnapshot();
  const playback = useArrangementPlaybackSnapshot();
  const [draggingSectionId, setDraggingSectionId] =
    useState<string | null>(null);
  const [newSectionPatternId, setNewSectionPatternId] =
    useState("");

  useEffect(() => {
    const handleHistory = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, button, [role='slider']"))
      ) {
        return;
      }

      const command = event.metaKey || event.ctrlKey;
      if (!command) return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          arrangementStore.redo();
        } else {
          arrangementStore.undo();
        }
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        arrangementStore.redo();
      }
    };

    window.addEventListener("keydown", handleHistory);
    return () => window.removeEventListener("keydown", handleHistory);
  }, []);

  useEffect(() => {
    if (arrangement.blueprint) return;

    const blueprint = foundation.blueprint;
    if (!blueprint || !family.family) return;
    if (blueprint.familyId !== family.family.id) return;

    arrangementPlaybackStore.stop();
    arrangementStore.loadFromFoundation(
      blueprint,
      family.patterns,
    );
  }, [
    arrangement.blueprint?.id,
    foundation.blueprint?.id,
    family.family?.id,
    family.revision,
  ]);

  const arrangementPatterns = useMemo(
    () =>
      arrangementStore.exportProjectState().patterns,
    [arrangement.musicalRevision],
  );

  const patternLabelById = useMemo(() => {
    const labels = new Map(
      arrangementPatterns.map((pattern) => [
        pattern.id,
        pattern.name,
      ]),
    );
    for (const entry of family.patterns) {
      if (!labels.has(entry.pattern.id)) {
        labels.set(entry.pattern.id, entry.label);
      }
    }
    return labels;
  }, [arrangementPatterns, family.patterns]);

  const editablePatterns = useMemo(() => {
    if (!arrangement.blueprint) return [];
    const allowed = new Set(
      arrangement.blueprint.scenes.flatMap(
        (scene) => scene.patternIds,
      ),
    );
    return arrangementPatterns.filter(
      (pattern) => allowed.has(pattern.id),
    );
  }, [
    arrangement.blueprint,
    arrangementPatterns,
  ]);

  useEffect(() => {
    if (
      newSectionPatternId &&
      editablePatterns.some(
        (pattern) =>
          pattern.id === newSectionPatternId,
      )
    ) {
      return;
    }
    setNewSectionPatternId(
      editablePatterns[0]?.id ?? "",
    );
  }, [editablePatterns, newSectionPatternId]);

  const selectedSection =
    arrangement.blueprint?.sections.find(
      (section) => section.id === arrangement.selectedSectionId,
    ) ?? arrangement.blueprint?.sections[0];

  const selectedIndex = selectedSection
    ? arrangement.blueprint?.sections.findIndex(
        (section) => section.id === selectedSection.id,
      ) ?? -1
    : -1;

  const selectedScene = selectedSection
    ? arrangement.blueprint?.scenes.find(
        (scene) => scene.id === selectedSection.sceneId,
      )
    : undefined;
  const selectedPatternId =
    selectedSection?.patternSequence[0];
  const foundationAvailable = Boolean(
    foundation.blueprint &&
      family.family &&
      foundation.blueprint.familyId ===
        family.family.id,
  );
  const currentMatchesFoundation =
    Boolean(foundation.blueprint) &&
    arrangement.sourceFoundationId ===
      foundation.blueprint?.id;

  const totalTicks = Math.max(1, arrangement.totalTicks);
  const playheadPercent = Math.max(
    0,
    Math.min(100, (playback.playheadTick / totalTicks) * 100),
  );
  const totalBeats = arrangement.totalTicks / PPQ;

  if (!arrangement.blueprint) {
    return (
      <section className="arrange-surface arrange-surface--empty">
        <div className="surface-heading">
          <div>
            <p className="eyebrow">04 / ARRANGE</p>
            <h1>Shape the full arc.</h1>
          </div>
          <TransportStatusLabel />
        </div>

        <TransportPulseSpine />

        <div className="arrange-empty-state">
          <span>
            {foundationAvailable
              ? "FOUNDATION READY"
              : "NO SONG YET"}
          </span>
          <strong>
            {foundationAvailable
              ? foundation.blueprint!.name
              : "Build a song in Playground or create an arrangement foundation."}
          </strong>
          <p>
            Playground songs and CREATE foundations both open here as the same
            canonical arrangement. Nothing is replaced when you move between
            the two workspaces.
          </p>
          {foundationAvailable ? (
            <MachineButton
              onClick={() =>
                arrangementStore.loadFromFoundation(
                  foundation.blueprint!,
                  family.patterns,
                )
              }
            >
              LOAD ARRANGEMENT
            </MachineButton>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="arrange-surface" aria-labelledby="arrange-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">04 / ARRANGE</p>
          <h1 id="arrange-title">Shape the full arc.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <section
        className="arrange-structure"
        aria-label="Song structure controls"
      >
        <label className="arrange-name-field">
          <span>SONG</span>
          <input
            key={arrangement.blueprint.id + ":" + arrangement.blueprint.name}
            defaultValue={arrangement.blueprint.name}
            maxLength={80}
            aria-label="Arrangement name"
            onBlur={(event) =>
              arrangementStore.renameArrangement(
                event.currentTarget.value,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.currentTarget.value =
                  arrangement.blueprint!.name;
                event.currentTarget.blur();
              }
            }}
          />
        </label>

        <div className="arrange-structure__add">
          <label>
            <span>ADD SECTION</span>
            <select
              value={newSectionPatternId}
              disabled={editablePatterns.length === 0}
              onChange={(event) =>
                setNewSectionPatternId(
                  event.currentTarget.value,
                )
              }
              aria-label="New section pattern"
            >
              {editablePatterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {patternLabelById.get(pattern.id) ?? pattern.name}
                </option>
              ))}
            </select>
          </label>
          <MachineButton
            compact
            disabled={!newSectionPatternId}
            onClick={() =>
              arrangementStore.addSectionFromPattern(
                newSectionPatternId,
                selectedSection?.id,
              )
            }
          >
            + ADD
          </MachineButton>
          <MachineButton
            compact
            disabled={!selectedSection}
            onClick={() =>
              selectedSection
                ? void arrangementPlaybackStore.start(
                    selectedSection.id,
                    false,
                  )
                : undefined
            }
          >
            PLAY FROM HERE
          </MachineButton>
        </div>
      </section>

      <div className="arrange-transport">
        <div className="machine-section-label">
          <span>ARRANGEMENT / TRANSPORT</span>
          <span>
            {playback.engaged
              ? playback.scope.toUpperCase() + " / " + playback.transportStatus.toUpperCase()
              : "IDLE"}
          </span>
        </div>

        <div className="arrange-transport__controls">
          <MachineButton
            onClick={() => void arrangementPlaybackStore.start()}
          >
            PLAY ALL
          </MachineButton>
          <MachineButton
            disabled={!selectedSection}
            onClick={() =>
              selectedSection
                ? void arrangementPlaybackStore.start(
                    selectedSection.id,
                    true,
                  )
                : undefined
            }
          >
            PLAY SECTION
          </MachineButton>
          <MachineButton
            disabled={!playback.engaged}
            onClick={() => void arrangementPlaybackStore.toggle()}
          >
            {playback.transportStatus === "running" ? "PAUSE" : "RESUME"}
          </MachineButton>
          <MachineButton
            disabled={!playback.engaged}
            onClick={() => arrangementPlaybackStore.stop()}
          >
            STOP
          </MachineButton>

          <div className="arrange-transport__readout">
            <span>PLAYHEAD</span>
            <strong>{Math.round(playback.playheadTick / PPQ)} BEAT</strong>
          </div>
          <div className="arrange-transport__readout">
            <span>TOTAL</span>
            <strong>{Math.round(totalBeats)} BEAT</strong>
          </div>
          <div className="arrange-transport__readout">
            <span>SECTIONS</span>
            <strong>{arrangement.blueprint.sections.length}</strong>
          </div>
          <div className="arrange-transport__readout">
            <span>ENERGY</span>
            <strong>
              {playback.engaged
                ? "E" + Math.round(playback.currentEnergy * 100)
                : "--"}
            </strong>
          </div>
        </div>

        <div className="arrange-playhead-rail" aria-hidden="true">
          <i style={{ width: playheadPercent + "%" }} />
          <b style={{ left: playheadPercent + "%" }} />
        </div>
      </div>

      <section className="arrange-timeline" aria-labelledby="arrange-timeline-title">
        <div className="machine-section-label">
          <span id="arrange-timeline-title">SECTION / TIMELINE</span>
          <span>SELECT → EDIT → PLAY</span>
        </div>

        <p className="sr-only" id="arrange-reorder-help">
          Sections can be reordered by drag and drop. Keyboard and touch users
          can select a section and use the Move Left and Move Right controls in
          Section Edit.
        </p>
        <div
          className="arrange-timeline__scroll"
          aria-describedby="arrange-reorder-help"
        >
          <div className="arrange-timeline__track">
            {arrangement.blueprint.sections.map((section, index) => {
              const active =
                playback.engaged &&
                playback.currentSectionId === section.id;
              const selected = section.id === arrangement.selectedSectionId;
              const width =
                Math.max(
                  8,
                  (section.lengthTicks / totalTicks) * 100,
                );
              const sectionOccurrences =
                arrangement.occurrences.filter(
                  (occurrence) =>
                    occurrence.sectionId === section.id,
                );

              return (
                <button
                  type="button"
                  key={section.id}
                  className={[
                    "arrange-section-block",
                    selected ? "is-selected" : "",
                    active ? "is-playing" : "",
                    "role-" + section.role,
                    draggingSectionId === section.id
                      ? "is-dragging"
                      : "",
                  ].join(" ")}
                  draggable
                  onDragStart={(event) => {
                    setDraggingSectionId(section.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "text/plain",
                      section.id,
                    );
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId =
                      event.dataTransfer.getData("text/plain") ||
                      draggingSectionId;
                    if (sourceId) {
                      arrangementStore.moveSectionTo(
                        sourceId,
                        section.id,
                      );
                    }
                    setDraggingSectionId(null);
                  }}
                  onDragEnd={() => setDraggingSectionId(null)}
                  style={{
                    flexBasis: width + "%",
                    flexGrow: section.lengthTicks,
                  }}
                  onClick={() => arrangementStore.selectSection(section.id)}
                  aria-pressed={selected}
                  aria-label={
                    section.label +
                    ", section " +
                    (index + 1) +
                    " of " +
                    (arrangement.blueprint?.sections.length ?? 0) +
                    ". Select to edit. Reorder controls are available in Section Edit."
                  }
                >
                  <span className="arrange-section-block__ordinal">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{section.label}</strong>
                  <small>
                    {roleCode(section.role)} · {section.cycleCount} CYC
                  </small>

                  <span className="arrange-section-block__cycles">
                    {sectionOccurrences.map((occurrence) => (
                      <i
                        key={occurrence.id}
                        className={
                          occurrence.kind === "transition"
                            ? "is-transition"
                            : occurrence.kind === "fill"
                              ? "is-fill"
                              : ""
                        }
                      >
                        {occurrence.kind === "transition"
                          ? "TRN"
                          : patternLabelById.get(
                              occurrence.patternId,
                            ) ?? "?"}
                      </i>
                    ))}
                  </span>

                  <span className="arrange-section-block__energy">
                    E{Math.round(section.energyStart * 100)}
                    {"→"}
                    {Math.round(section.energyEnd * 100)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="energy-sculpture" aria-labelledby="energy-sculpture-title">
        <div className="machine-section-label">
          <span id="energy-sculpture-title">ENERGY / SCULPTURE</span>
          <span>SECTION START → END</span>
        </div>

        <div className="energy-sculpture__stage">
          <svg
            viewBox="0 0 1000 220"
            preserveAspectRatio="none"
            role="img"
            aria-label="Arrangement energy sculpture"
          >
            <path
              className="energy-sculpture__grid"
              d="M0 55 H1000 M0 110 H1000 M0 165 H1000"
            />
            {arrangement.blueprint.sections.map((section) => {
              const x1 =
                (section.startTick / totalTicks) * 1000;
              const x2 =
                ((section.startTick + section.lengthTicks) /
                  totalTicks) *
                1000;
              const y1 = 200 - section.energyStart * 180;
              const y2 = 200 - section.energyEnd * 180;
              const selected =
                section.id === arrangement.selectedSectionId;

              return (
                <g
                  key={section.id}
                  className={
                    selected
                      ? "energy-sculpture__segment is-selected"
                      : "energy-sculpture__segment"
                  }
                  onClick={() => arrangementStore.selectSection(section.id)}
                >
                  <line x1={x1} y1={y1} x2={x2} y2={y2} />
                  <circle cx={x1} cy={y1} r={selected ? 6 : 3} />
                  <circle cx={x2} cy={y2} r={selected ? 6 : 3} />
                </g>
              );
            })}
            {playback.engaged ? (
              <line
                className="energy-sculpture__playhead"
                x1={(playback.playheadTick / totalTicks) * 1000}
                x2={(playback.playheadTick / totalTicks) * 1000}
                y1="10"
                y2="210"
              />
            ) : null}
          </svg>
        </div>

        {selectedSection ? (
          <div className="energy-sculpture__controls">
            <SignalRail
              label="ENERGY START"
              value={selectedSection.energyStart * 100}
              tone="ice"
              onChange={(value) =>
                arrangementStore.setSectionEnergyStart(
                  selectedSection.id,
                  value / 100,
                )
              }
            />
            <SignalRail
              label="ENERGY END"
              value={selectedSection.energyEnd * 100}
              tone="heat"
              onChange={(value) =>
                arrangementStore.setSectionEnergyEnd(
                  selectedSection.id,
                  value / 100,
                )
              }
            />
          </div>
        ) : null}
      </section>

      {selectedSection ? (
        <section className="arrange-editor" aria-labelledby="arrange-editor-title">
          <div className="machine-section-label">
            <span id="arrange-editor-title">SECTION / EDIT</span>
            <span>
              {String(selectedIndex + 1).padStart(2, "0")} /{" "}
              {arrangement.blueprint.sections.length}
            </span>
          </div>

          <div className="arrange-editor__body">
            <div className="arrange-editor__identity">
              <span>{roleCode(selectedSection.role)}</span>
              <input
                key={
                  selectedSection.id +
                  ":" +
                  selectedSection.label
                }
                defaultValue={selectedSection.label}
                maxLength={48}
                aria-label="Section name"
                onBlur={(event) =>
                  arrangementStore.setSectionLabel(
                    selectedSection.id,
                    event.currentTarget.value,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.currentTarget.value =
                      selectedSection.label;
                    event.currentTarget.blur();
                  }
                }}
              />
              <small>{selectedScene?.name ?? selectedSection.role}</small>

              <div className="arrange-editor__identity-selects">
                <label>
                  <span>ROLE</span>
                  <select
                    value={selectedSection.role}
                    aria-label="Section role"
                    onChange={(event) =>
                      arrangementStore.setSectionRole(
                        selectedSection.id,
                        event.currentTarget.value as SceneRole,
                      )
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>PATTERN</span>
                  <select
                    value={selectedPatternId ?? ""}
                    aria-label="Section pattern"
                    disabled={editablePatterns.length === 0}
                    onChange={(event) =>
                      arrangementStore.setSectionPattern(
                        selectedSection.id,
                        event.currentTarget.value,
                      )
                    }
                  >
                    {editablePatterns.map((pattern) => (
                      <option key={pattern.id} value={pattern.id}>
                        {patternLabelById.get(pattern.id) ?? pattern.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="arrange-editor__moves">
              <button
                type="button"
                disabled={selectedIndex <= 0}
                onClick={() =>
                  arrangementStore.moveSection(selectedSection.id, -1)
                }
              >
                ← MOVE
              </button>
              <button
                type="button"
                disabled={
                  selectedIndex < 0 ||
                  selectedIndex >=
                    arrangement.blueprint.sections.length - 1
                }
                onClick={() =>
                  arrangementStore.moveSection(selectedSection.id, 1)
                }
              >
                MOVE →
              </button>
              <button
                type="button"
                onClick={() =>
                  arrangementStore.duplicateSection(selectedSection.id)
                }
              >
                DUP
              </button>
              <button
                type="button"
                disabled={arrangement.blueprint.sections.length <= 1}
                onClick={() =>
                  arrangementStore.removeSection(selectedSection.id)
                }
              >
                DEL
              </button>
            </div>

            <div className="arrange-editor__cycles">
              <span>CYCLES</span>
              <button
                type="button"
                disabled={selectedSection.cycleCount <= 1}
                onClick={() =>
                  arrangementStore.setSectionCycles(
                    selectedSection.id,
                    selectedSection.cycleCount - 1,
                  )
                }
              >
                −
              </button>
              <strong>{selectedSection.cycleCount}</strong>
              <button
                type="button"
                disabled={selectedSection.cycleCount >= 16}
                onClick={() =>
                  arrangementStore.setSectionCycles(
                    selectedSection.id,
                    selectedSection.cycleCount + 1,
                  )
                }
              >
                +
              </button>
              <div
                className="arrange-editor__cycle-presets"
                aria-label="Section length presets"
              >
                {[1, 2, 4, 8].map((cycles) => (
                  <button
                    type="button"
                    key={cycles}
                    className={
                      selectedSection.cycleCount === cycles
                        ? "is-active"
                        : ""
                    }
                    onClick={() =>
                      arrangementStore.setSectionCycles(
                        selectedSection.id,
                        cycles,
                      )
                    }
                    aria-label={
                      "Set section to " +
                      cycles +
                      (cycles === 1
                        ? " cycle"
                        : " cycles")
                    }
                  >
                    {cycles}×
                  </button>
                ))}
              </div>
            </div>

            <div className="arrange-editor__routes">
              <button
                type="button"
                disabled={!selectedSection.fillPatternId}
                className={
                  selectedSection.fillPlacement === "off"
                    ? ""
                    : "is-active"
                }
                onClick={() =>
                  arrangementStore.toggleFillPlacement(selectedSection.id)
                }
              >
                {selectedSection.fillPatternId
                  ? selectedSection.fillPlacement === "off"
                    ? "FILL / OFF"
                    : "FILL / LAST"
                  : "NO FILL"}
              </button>

              <button
                type="button"
                disabled={!selectedSection.transitionPatternId}
                className={
                  selectedSection.transitionPlacement === "off"
                    ? ""
                    : "is-active"
                }
                onClick={() =>
                  arrangementStore.cycleTransitionPlacement(
                    selectedSection.id,
                  )
                }
              >
                {selectedSection.transitionPatternId
                  ? transitionLabel(selectedSection.transitionPlacement)
                  : "NO TRANSITION"}
              </button>
            </div>

            <div className="arrange-editor__timing">
              <div>
                <span>START</span>
                <strong>{selectedSection.startTick}</strong>
              </div>
              <div>
                <span>LENGTH</span>
                <strong>{selectedSection.lengthTicks}</strong>
              </div>
              <div>
                <span>BEATS</span>
                <strong>
                  {Math.round(selectedSection.lengthTicks / PPQ)}
                </strong>
              </div>
            </div>
          </div>

          <div className="arrange-editor__sequence">
            {arrangement.occurrences
              .filter(
                (occurrence) =>
                  occurrence.sectionId === selectedSection.id,
              )
              .map((occurrence, index) => (
                <span
                  key={occurrence.id}
                  className={
                    occurrence.kind === "transition"
                      ? "is-transition"
                      : occurrence.kind === "fill"
                        ? "is-fill"
                        : ""
                  }
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <strong>
                    {occurrence.kind === "transition"
                      ? "TRANSITION"
                      : patternLabelById.get(
                          occurrence.patternId,
                        ) ?? "?"}
                  </strong>
                </span>
              ))}
          </div>
        </section>
      ) : null}

      <div className="arrange-footer">
        <span>
          Source:{" "}
          {currentMatchesFoundation
            ? "CREATE FOUNDATION"
            : "PLAYGROUND / PROJECT SONG"}{" "}
          · {arrangement.edited ? "EDITED" : "CLEAN"}
        </span>

        <div className="arrange-footer__actions">
          <MachineButton
            compact
            disabled={!arrangement.canUndo}
            onClick={() => arrangementStore.undo()}
          >
            UNDO
          </MachineButton>
          <MachineButton
            compact
            disabled={!arrangement.canRedo}
            onClick={() => arrangementStore.redo()}
          >
            REDO
          </MachineButton>
          <MachineButton
            disabled={!foundationAvailable}
            onClick={() => {
              if (!foundation.blueprint || !family.family) {
                return;
              }
              arrangementPlaybackStore.stop();
              arrangementStore.loadFromFoundation(
                foundation.blueprint,
                family.patterns,
              );
            }}
          >
            RESET TO FOUNDATION
          </MachineButton>
        </div>
      </div>
    </section>
  );
}
