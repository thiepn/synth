import { useMemo, useState } from "react";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  generationHistoryStore,
  type EvolutionNode,
} from "../../history/GenerationHistoryStore";
import { useGenerationHistorySnapshot } from "../../history/useGenerationHistory";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import { MachineButton, RhythmGlyph } from "../pulse/Primitives";

interface NodeBranchProps {
  node: EvolutionNode;
  childrenByParent: Map<string, EvolutionNode[]>;
  activeNodeId: string;
  selectedNodeId: string;
  rootNodeId: string;
  editingNodeId: string | null;
  renameDraft: string;
  onSelect: (nodeId: string) => void;
  onAudition: (node: EvolutionNode) => void;
  onRestore: (nodeId: string) => void;
  onBranch: (nodeId: string) => void;
  onFavorite: (nodeId: string) => void;
  onBeginRename: (node: EvolutionNode) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: (nodeId: string) => void;
  onCancelRename: () => void;
  onDelete: (nodeId: string) => void;
}

function strongestStyle(node: EvolutionNode): string {
  const style = Object.entries(node.pattern.provenance?.style ?? {}).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  if (!style) return "---";
  if (style === "hipHop") return "HIP-HOP";
  if (style === "breakbeat") return "BREAKS";
  return style.toUpperCase();
}

function shortOperation(node: EvolutionNode): string {
  const mutation = node.pattern.provenance?.mutationId;
  if (mutation) {
    return mutation
      .replace("mutation:", "")
      .replace("reroll:", "")
      .replace("field:", "FIELD ")
      .toUpperCase();
  }

  return node.operationLabel;
}

function NodeBranch({
  node,
  childrenByParent,
  activeNodeId,
  selectedNodeId,
  rootNodeId,
  editingNodeId,
  renameDraft,
  onSelect,
  onAudition,
  onRestore,
  onBranch,
  onFavorite,
  onBeginRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onDelete,
}: NodeBranchProps) {
  const children = childrenByParent.get(node.id) ?? [];
  const geometry = deriveRhythmGlyph(node.pattern);
  const active = node.id === activeNodeId;
  const selected = node.id === selectedNodeId;
  const editing = node.id === editingNodeId;

  return (
    <li className="evolution-tree__branch">
      <div
        className={[
          "evolution-node",
          active ? "is-active" : "",
          selected ? "is-selected" : "",
          node.favorite ? "is-favorite" : "",
        ].join(" ")}
        onClick={() => onSelect(node.id)}
      >
        <div className="evolution-node__signal">
          <span className="evolution-node__ordinal">
            {String(node.ordinal).padStart(2, "0")}
          </span>
          <RhythmGlyph
            geometry={geometry}
            compact
            label={
              node.title +
              " rhythm glyph " +
              geometry.signature
            }
          />
        </div>

        <div className="evolution-node__body">
          <div className="evolution-node__meta">
            <span>{node.operationLabel}</span>
            <span>{"RG-" + node.glyphSignature.slice(0, 6)}</span>
            {active ? <strong>ACTIVE</strong> : null}
          </div>

          {editing ? (
            <input
              className="evolution-node__rename"
              value={renameDraft}
              maxLength={48}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                onRenameDraftChange(event.currentTarget.value)
              }
              onBlur={() => onCommitRename(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename(node.id);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              aria-label={"Rename " + node.title}
            />
          ) : (
            <strong className="evolution-node__title">{node.title}</strong>
          )}

          <div className="evolution-node__descriptor">
            <span>{strongestStyle(node)}</span>
            <span>{shortOperation(node)}</span>
          </div>
        </div>

        <div
          className="evolution-node__actions"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onAudition(node)}
            title="Audition this Pattern without restoring it"
            aria-label={"Audition " + node.title}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => onRestore(node.id)}
            title="Restore this node"
          >
            RST
          </button>
          <button
            type="button"
            onClick={() => onBranch(node.id)}
            title="Create a new branch from this node"
          >
            BR+
          </button>
          <button
            type="button"
            className={node.favorite ? "is-active" : ""}
            onClick={() => onFavorite(node.id)}
            title={node.favorite ? "Remove favorite" : "Favorite"}
            aria-pressed={node.favorite}
          >
            ★
          </button>
          <button
            type="button"
            onClick={() => onBeginRename(node)}
            title="Rename node"
          >
            REN
          </button>
          <button
            type="button"
            disabled={node.id === rootNodeId}
            onClick={() => onDelete(node.id)}
            title={
              node.id === rootNodeId
                ? "Root cannot be deleted"
                : "Delete this branch and all descendants"
            }
          >
            CUT
          </button>
        </div>
      </div>

      {children.length > 0 ? (
        <ul className="evolution-tree__children">
          {children.map((child) => (
            <NodeBranch
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              activeNodeId={activeNodeId}
              selectedNodeId={selectedNodeId}
              rootNodeId={rootNodeId}
              editingNodeId={editingNodeId}
              renameDraft={renameDraft}
              onSelect={onSelect}
              onAudition={onAudition}
              onRestore={onRestore}
              onBranch={onBranch}
              onFavorite={onFavorite}
              onBeginRename={onBeginRename}
              onRenameDraftChange={onRenameDraftChange}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function EvolutionTreePanel() {
  const history = useGenerationHistorySnapshot();
  const transport = useTransportSnapshot();
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const nodesById = useMemo(
    () => new Map(history.nodes.map((node) => [node.id, node])),
    [history.nodes],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, EvolutionNode[]>();

    for (const node of history.nodes) {
      if (!node.parentId) continue;
      const list = map.get(node.parentId) ?? [];
      list.push(node);
      map.set(node.parentId, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.ordinal - b.ordinal);
    }

    return map;
  }, [history.nodes]);

  const root = nodesById.get(history.rootNodeId);
  const selected = nodesById.get(history.selectedNodeId);
  const selectedChildren =
    selected ? childrenByParent.get(selected.id)?.length ?? 0 : 0;

  const select = (nodeId: string) => {
    generationHistoryStore.select(nodeId);
  };

  const audition = (node: EvolutionNode) => {
    void drumEngine.auditionPattern(node.pattern, transport.bpm);
  };

  const restore = (nodeId: string) => {
    const pattern = generationHistoryStore.restore(nodeId);
    sequencerStore.restorePatternSnapshot(pattern);
  };

  const branch = (nodeId: string) => {
    const node = generationHistoryStore.branchFrom(nodeId);
    sequencerStore.restorePatternSnapshot(node.pattern);
  };

  const removeBranch = (nodeId: string) => {
    const fallback = generationHistoryStore.deleteBranch(nodeId);
    if (fallback) {
      sequencerStore.restorePatternSnapshot(fallback);
    }
  };

  const beginRename = (node: EvolutionNode) => {
    setEditingNodeId(node.id);
    setRenameDraft(node.title);
  };

  const commitRename = (nodeId: string) => {
    generationHistoryStore.rename(nodeId, renameDraft);
    setEditingNodeId(null);
    setRenameDraft("");
  };

  if (!root || !selected) return null;

  const selectedGeometry = deriveRhythmGlyph(selected.pattern);

  return (
    <section
      className="evolution-panel"
      aria-labelledby="evolution-tree-title"
    >
      <div className="machine-section-label">
        <span id="evolution-tree-title">EVOLUTION / TREE</span>
        <span>
          {history.nodes.length} NODES ·{" "}
          {history.nodes.filter((node) => node.favorite).length} FAV
        </span>
      </div>

      <div className="evolution-panel__body">
        <div className="evolution-tree-shell">
          <ul className="evolution-tree">
            <NodeBranch
              node={root}
              childrenByParent={childrenByParent}
              activeNodeId={history.activeNodeId}
              selectedNodeId={history.selectedNodeId}
              rootNodeId={history.rootNodeId}
              editingNodeId={editingNodeId}
              renameDraft={renameDraft}
              onSelect={select}
              onAudition={audition}
              onRestore={restore}
              onBranch={branch}
              onFavorite={(nodeId) =>
                generationHistoryStore.toggleFavorite(nodeId)
              }
              onBeginRename={beginRename}
              onRenameDraftChange={setRenameDraft}
              onCommitRename={commitRename}
              onCancelRename={() => {
                setEditingNodeId(null);
                setRenameDraft("");
              }}
              onDelete={removeBranch}
            />
          </ul>
        </div>

        <aside className="evolution-inspector">
          <div className="evolution-inspector__glyph">
            <RhythmGlyph
              geometry={selectedGeometry}
              label={
                "Selected history node " +
                selected.title +
                " glyph " +
                selectedGeometry.signature
              }
            />
          </div>

          <div className="evolution-inspector__title">
            <span>SELECTED / {selected.operationLabel}</span>
            <strong>{selected.title}</strong>
          </div>

          <dl className="evolution-inspector__data">
            <div>
              <dt>NODE</dt>
              <dd>{selected.id.replace("hist-", "#")}</dd>
            </div>
            <div>
              <dt>STYLE</dt>
              <dd>{strongestStyle(selected)}</dd>
            </div>
            <div>
              <dt>GLYPH</dt>
              <dd>{"RG-" + selected.glyphSignature.slice(0, 6)}</dd>
            </div>
            <div>
              <dt>CHILDREN</dt>
              <dd>{String(selectedChildren).padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>MUTATION</dt>
              <dd>{shortOperation(selected)}</dd>
            </div>
            <div>
              <dt>SOURCE</dt>
              <dd>
                {selected.pattern.provenance?.sourceHistoryNodeId
                  ?.replace("hist-", "#") ?? "---"}
              </dd>
            </div>
          </dl>

          <div className="evolution-inspector__actions">
            <MachineButton onClick={() => audition(selected)}>
              AUDITION
            </MachineButton>
            <MachineButton
              active={selected.id === history.activeNodeId}
              onClick={() => restore(selected.id)}
            >
              RESTORE
            </MachineButton>
            <MachineButton onClick={() => branch(selected.id)}>
              BRANCH
            </MachineButton>
          </div>
        </aside>
      </div>

      <p className="evolution-panel__note">
        Undo/Redo remains editor history. This tree stores creative lineage.
        Restore an older node, then Generate/Reroll/Mutate to create a real
        branch. AUDITION plays one loop without replacing the current Pattern.
      </p>
    </section>
  );
}
