type ProjectTransientReset = () => void;

const resetters = new Map<string, ProjectTransientReset>();

export function registerProjectTransientReset(
  id: string,
  reset: ProjectTransientReset,
): () => void {
  resetters.set(id, reset);
  return () => {
    if (resetters.get(id) === reset) {
      resetters.delete(id);
    }
  };
}

export function resetLoadedProjectTransientState(): void {
  for (const [id, reset] of resetters) {
    try {
      reset();
    } catch (error) {
      console.error(
        "Synth transient reset failed for " + id + ".",
        error,
      );
    }
  }
}

export function loadedProjectTransientResetIds(): string[] {
  return [...resetters.keys()].sort();
}
