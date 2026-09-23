import {
  assertProjectDocument,
  projectSummary,
  versionSummary,
  type LoadedProjectBundle,
  type PersistedAudioAsset,
  type ProjectSummary,
  type ProjectVersionRecord,
  type ProjectVersionSummary,
  type SynthProjectDocument,
} from "../project/projectTypes";

const DATABASE_NAME = "synth-local-v1";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const META_STORE = "meta";
const VERSION_STORE = "versions";
const ACTIVE_PROJECT_KEY = "activeProjectId";

interface MetaRecord {
  key: string;
  value: string;
}

export class ProjectRevisionConflictError extends Error {
  constructor(
    readonly projectId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      "Project was changed in another tab. Expected revision " +
        expectedRevision +
        " but found " +
        actualRevision +
        ".",
    );
    this.name = "ProjectRevisionConflictError";
  }
}

function requestResult<T>(
  request: IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("IndexedDB request failed."),
      );
  });
}

function transactionDone(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("IndexedDB transaction failed."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("IndexedDB transaction was aborted."),
      );
  });
}

function clonePersistedAsset(
  asset: PersistedAudioAsset,
): PersistedAudioAsset {
  return {
    id: asset.id,
    state: {
      reference: { ...asset.state.reference },
      decodeStatus: asset.state.decodeStatus,
      waveform: [...asset.state.waveform],
      lastError: asset.state.lastError,
    },
    bytes: asset.bytes.slice(0),
    updatedAt: asset.updatedAt,
  };
}

function cloneVersion(
  version: ProjectVersionRecord,
): ProjectVersionRecord {
  return {
    ...version,
    document: structuredClone(version.document),
  };
}

export class LocalProjectDatabase {
  private databasePromise: Promise<IDBDatabase> | undefined;

  get supported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  async open(): Promise<IDBDatabase> {
    if (!this.supported) {
      throw new Error(
        "IndexedDB is unavailable in this browser context.",
      );
    }

    if (this.databasePromise) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise<IDBDatabase>(
      (resolve, reject) => {
        const request = indexedDB.open(
          DATABASE_NAME,
          DATABASE_VERSION,
        );

        request.onupgradeneeded = () => {
          const db = request.result;

          if (!db.objectStoreNames.contains(PROJECT_STORE)) {
            const projects = db.createObjectStore(
              PROJECT_STORE,
              { keyPath: "id" },
            );
            projects.createIndex(
              "updatedAt",
              "updatedAt",
              { unique: false },
            );
          }

          if (!db.objectStoreNames.contains(ASSET_STORE)) {
            db.createObjectStore(
              ASSET_STORE,
              { keyPath: "id" },
            );
          }

          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(
              META_STORE,
              { keyPath: "key" },
            );
          }

          if (!db.objectStoreNames.contains(VERSION_STORE)) {
            const versions = db.createObjectStore(
              VERSION_STORE,
              { keyPath: "id" },
            );
            versions.createIndex(
              "projectId",
              "projectId",
              { unique: false },
            );
            versions.createIndex(
              "createdAt",
              "createdAt",
              { unique: false },
            );
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.databasePromise = undefined;
          };
          resolve(db);
        };

        request.onerror = () => {
          this.databasePromise = undefined;
          reject(
            request.error ??
              new Error("Could not open Synth local storage."),
          );
        };

        request.onblocked = () => {
          this.databasePromise = undefined;
          reject(
            new Error(
              "Synth storage upgrade is blocked by another open tab.",
            ),
          );
        };
      },
    );

    return this.databasePromise;
  }

  async saveProject(
    document: SynthProjectDocument,
    assets: readonly PersistedAudioAsset[],
    expectedRevision?: number,
    activate = true,
  ): Promise<void> {
    assertProjectDocument(document);
    const db = await this.open();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, ASSET_STORE, META_STORE],
        "readwrite",
      );
      const projectStore = transaction.objectStore(PROJECT_STORE);
      const assetStore = transaction.objectStore(ASSET_STORE);
      const metaStore = transaction.objectStore(META_STORE);
      let conflict: ProjectRevisionConflictError | undefined;
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      };

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      transaction.onerror = () => {
        fail(
          transaction.error ??
            new Error("IndexedDB project save failed."),
        );
      };
      transaction.onabort = () => {
        fail(
          conflict ??
            transaction.error ??
            new Error("IndexedDB project save was aborted."),
        );
      };

      const read = projectStore.get(document.id);
      read.onerror = () => {
        try {
          transaction.abort();
        } catch {
          // Transaction may already be aborting.
        }
        fail(
          read.error ??
            new Error("Could not read current project revision."),
        );
      };
      read.onsuccess = () => {
        const existing = read.result as unknown;
        let actualRevision = 0;

        if (existing) {
          try {
            assertProjectDocument(existing);
            actualRevision = existing.revision;
          } catch (error) {
            try {
              transaction.abort();
            } catch {
              // Transaction may already be aborting.
            }
            fail(error);
            return;
          }
        }

        if (
          expectedRevision !== undefined &&
          actualRevision !== expectedRevision
        ) {
          conflict = new ProjectRevisionConflictError(
            document.id,
            expectedRevision,
            actualRevision,
          );
          try {
            transaction.abort();
          } catch {
            // Transaction may already be aborting.
          }
          return;
        }

        projectStore.put(structuredClone(document));
        for (const asset of assets) {
          assetStore.put(clonePersistedAsset(asset));
        }
        if (activate) {
          metaStore.put({
            key: ACTIVE_PROJECT_KEY,
            value: document.id,
          } satisfies MetaRecord);
        }
      };
    });
  }

  async loadProject(
    projectId: string,
  ): Promise<LoadedProjectBundle | undefined> {
    const document = await this.getProjectDocument(projectId);
    if (!document) return undefined;

    return {
      document,
      assets: await this.loadAssets(document.assetIds),
    };
  }

  async getProjectDocument(
    projectId: string,
  ): Promise<SynthProjectDocument | undefined> {
    const db = await this.open();
    const transaction = db.transaction(
      PROJECT_STORE,
      "readonly",
    );
    const done = transactionDone(transaction);
    const document = await requestResult(
      transaction.objectStore(PROJECT_STORE).get(projectId),
    ) as unknown;
    await done;

    if (!document) return undefined;
    assertProjectDocument(document);
    return structuredClone(document);
  }

  async loadAssets(
    assetIds: readonly string[],
  ): Promise<PersistedAudioAsset[]> {
    if (assetIds.length === 0) return [];

    const db = await this.open();
    const transaction = db.transaction(
      ASSET_STORE,
      "readonly",
    );
    const done = transactionDone(transaction);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const requests = assetIds.map(
      (assetId) =>
        requestResult(assetStore.get(assetId)).then(
          (record) => ({
            assetId,
            record: record as PersistedAudioAsset | undefined,
          }),
        ),
    );
    const records = await Promise.all(requests);
    await done;

    return records.map(({ assetId, record }) => {
      if (!record) {
        throw new Error(
          "Project references missing audio asset " + assetId + ".",
        );
      }
      return clonePersistedAsset(record);
    });
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.open();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(
      transaction.objectStore(PROJECT_STORE).getAll(),
    ) as unknown[];
    await done;

    const summaries: ProjectSummary[] = [];
    for (const record of records) {
      try {
        assertProjectDocument(record);
        summaries.push(projectSummary(record));
      } catch {
        // Corrupt/unsupported records are intentionally hidden.
      }
    }

    return summaries.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async saveVersion(
    version: ProjectVersionRecord,
  ): Promise<void> {
    assertProjectDocument(version.document);
    if (version.projectId !== version.document.id) {
      throw new Error("Version project identity does not match its document.");
    }

    const db = await this.open();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, VERSION_STORE],
        "readwrite",
      );
      const projectStore = transaction.objectStore(PROJECT_STORE);
      const versionStore = transaction.objectStore(VERSION_STORE);
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      };

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      transaction.onerror = () => {
        fail(
          transaction.error ??
            new Error("IndexedDB version save failed."),
        );
      };
      transaction.onabort = () => {
        fail(
          transaction.error ??
            new Error("IndexedDB version save was aborted."),
        );
      };

      const read = projectStore.get(version.projectId);
      read.onerror = () => {
        try {
          transaction.abort();
        } catch {
          // Transaction may already be aborting.
        }
        fail(
          read.error ??
            new Error("Could not verify the version parent project."),
        );
      };
      read.onsuccess = () => {
        if (!read.result) {
          try {
            transaction.abort();
          } catch {
            // Transaction may already be aborting.
          }
          fail(
            new Error(
              "Cannot create a version for a project that no longer exists.",
            ),
          );
          return;
        }

        versionStore.put(cloneVersion(version));
      };
    });
  }

  async getVersion(
    versionId: string,
  ): Promise<ProjectVersionRecord | undefined> {
    const db = await this.open();
    const transaction = db.transaction(
      VERSION_STORE,
      "readonly",
    );
    const done = transactionDone(transaction);
    const record = await requestResult(
      transaction.objectStore(VERSION_STORE).get(versionId),
    ) as ProjectVersionRecord | undefined;
    await done;

    if (!record) return undefined;
    assertProjectDocument(record.document);
    return cloneVersion(record);
  }

  async loadVersionBundle(
    versionId: string,
  ): Promise<LoadedProjectBundle | undefined> {
    const version = await this.getVersion(versionId);
    if (!version) return undefined;

    return {
      document: structuredClone(version.document),
      assets: await this.loadAssets(
        version.document.assetIds,
      ),
    };
  }

  async listVersions(
    projectId: string,
  ): Promise<ProjectVersionSummary[]> {
    const db = await this.open();
    const transaction = db.transaction(
      VERSION_STORE,
      "readonly",
    );
    const done = transactionDone(transaction);
    const index = transaction
      .objectStore(VERSION_STORE)
      .index("projectId");
    const records = await requestResult(
      index.getAll(IDBKeyRange.only(projectId)),
    ) as ProjectVersionRecord[];
    await done;

    return records
      .map((record) => {
        assertProjectDocument(record.document);
        return versionSummary(record);
      })
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
  }

  async deleteVersion(versionId: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(
      VERSION_STORE,
      "readwrite",
    );
    transaction.objectStore(VERSION_STORE).delete(versionId);
    await transactionDone(transaction);
    await this.garbageCollectAssets();
  }

  async getActiveProjectId(): Promise<string | undefined> {
    const db = await this.open();
    const transaction = db.transaction(META_STORE, "readonly");
    const done = transactionDone(transaction);
    const record = await requestResult(
      transaction.objectStore(META_STORE).get(ACTIVE_PROJECT_KEY),
    ) as MetaRecord | undefined;
    await done;
    return record?.value;
  }

  async setActiveProjectId(projectId: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({
      key: ACTIVE_PROJECT_KEY,
      value: projectId,
    } satisfies MetaRecord);
    await transactionDone(transaction);
  }

  async deleteProject(projectId: string): Promise<void> {
    const activeId = await this.getActiveProjectId();
    if (activeId === projectId) {
      throw new Error(
        "This project is active in another tab or session. Open a different project there before deleting it.",
      );
    }

    const db = await this.open();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        [PROJECT_STORE, VERSION_STORE],
        "readwrite",
      );
      const projectStore = transaction.objectStore(PROJECT_STORE);
      const versionStore = transaction.objectStore(VERSION_STORE);
      const versionIndex = versionStore.index("projectId");
      let settled = false;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      };

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      transaction.onerror = () => {
        fail(
          transaction.error ??
            new Error("Project deletion failed."),
        );
      };
      transaction.onabort = () => {
        fail(
          transaction.error ??
            new Error("Project deletion was aborted."),
        );
      };

      projectStore.delete(projectId);
      const cursorRequest =
        versionIndex.openKeyCursor(
          IDBKeyRange.only(projectId),
        );
      cursorRequest.onerror = () => {
        try {
          transaction.abort();
        } catch {
          // Transaction may already be aborting.
        }
        fail(
          cursorRequest.error ??
            new Error("Could not enumerate project versions."),
        );
      };
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        versionStore.delete(cursor.primaryKey);
        cursor.continue();
      };
    });

    await this.garbageCollectAssets();
  }

  async garbageCollectAssets(): Promise<string[]> {
    const db = await this.open();

    const projectTransaction = db.transaction(
      [PROJECT_STORE, VERSION_STORE],
      "readonly",
    );
    const projectDone = transactionDone(projectTransaction);
    const projectRecords = await requestResult(
      projectTransaction.objectStore(PROJECT_STORE).getAll(),
    ) as unknown[];
    const versionRecords = await requestResult(
      projectTransaction.objectStore(VERSION_STORE).getAll(),
    ) as ProjectVersionRecord[];
    await projectDone;

    const referenced = new Set<string>();

    for (const record of projectRecords) {
      try {
        assertProjectDocument(record);
        for (const assetId of record.assetIds) {
          referenced.add(assetId);
        }
      } catch {
        // Corrupt project records are left untouched; do not trust them for GC.
        return [];
      }
    }

    for (const version of versionRecords) {
      try {
        assertProjectDocument(version.document);
        for (const assetId of version.document.assetIds) {
          referenced.add(assetId);
        }
      } catch {
        return [];
      }
    }

    const assetTransaction = db.transaction(
      ASSET_STORE,
      "readwrite",
    );
    const assetDone = transactionDone(assetTransaction);
    const assetStore = assetTransaction.objectStore(ASSET_STORE);
    const keys = await requestResult(
      assetStore.getAllKeys(),
    );
    const removed: string[] = [];

    for (const key of keys) {
      const assetId = String(key);
      if (referenced.has(assetId)) continue;
      assetStore.delete(key);
      removed.push(assetId);
    }

    await assetDone;
    return removed;
  }
}

export const localProjectDatabase = new LocalProjectDatabase();
