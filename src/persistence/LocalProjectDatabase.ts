import {
  assertProjectDocument,
  projectSummary,
  type LoadedProjectBundle,
  type PersistedAudioAsset,
  type ProjectSummary,
  type SynthProjectDocument,
} from "../project/projectTypes";

const DATABASE_NAME = "synth-local-v1";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const META_STORE = "meta";
const ACTIVE_PROJECT_KEY = "activeProjectId";

interface MetaRecord {
  key: string;
  value: string;
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
  ): Promise<void> {
    assertProjectDocument(document);
    const db = await this.open();
    const transaction = db.transaction(
      [PROJECT_STORE, ASSET_STORE, META_STORE],
      "readwrite",
      { durability: "strict" },
    );
    const projectStore = transaction.objectStore(PROJECT_STORE);
    const assetStore = transaction.objectStore(ASSET_STORE);
    const metaStore = transaction.objectStore(META_STORE);

    projectStore.put(structuredClone(document));
    for (const asset of assets) {
      assetStore.put(clonePersistedAsset(asset));
    }
    metaStore.put({
      key: ACTIVE_PROJECT_KEY,
      value: document.id,
    } satisfies MetaRecord);

    await transactionDone(transaction);
  }

  async loadProject(
    projectId: string,
  ): Promise<LoadedProjectBundle | undefined> {
    const db = await this.open();
    const transaction = db.transaction(
      [PROJECT_STORE, ASSET_STORE],
      "readonly",
    );
    const document = await requestResult(
      transaction.objectStore(PROJECT_STORE).get(projectId),
    ) as unknown;
    if (!document) {
      await transactionDone(transaction);
      return undefined;
    }

    assertProjectDocument(document);
    const assets: PersistedAudioAsset[] = [];
    const assetStore = transaction.objectStore(ASSET_STORE);

    for (const assetId of document.assetIds) {
      const record = await requestResult(
        assetStore.get(assetId),
      ) as PersistedAudioAsset | undefined;
      if (!record) {
        throw new Error(
          "Project references missing audio asset " + assetId + ".",
        );
      }
      assets.push(clonePersistedAsset(record));
    }

    await transactionDone(transaction);
    return {
      document: structuredClone(document),
      assets,
    };
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.open();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(PROJECT_STORE).getAll(),
    ) as unknown[];
    await transactionDone(transaction);

    const summaries: ProjectSummary[] = [];
    for (const record of records) {
      try {
        assertProjectDocument(record);
        summaries.push(projectSummary(record));
      } catch {
        // Corrupt/unsupported records are intentionally not presented as valid projects.
      }
    }

    return summaries.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async getActiveProjectId(): Promise<string | undefined> {
    const db = await this.open();
    const transaction = db.transaction(META_STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(META_STORE).get(ACTIVE_PROJECT_KEY),
    ) as MetaRecord | undefined;
    await transactionDone(transaction);
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
    const db = await this.open();
    const transaction = db.transaction(
      [PROJECT_STORE, META_STORE],
      "readwrite",
    );
    transaction.objectStore(PROJECT_STORE).delete(projectId);

    const metaStore = transaction.objectStore(META_STORE);
    const active = await requestResult(
      metaStore.get(ACTIVE_PROJECT_KEY),
    ) as MetaRecord | undefined;
    if (active?.value === projectId) {
      metaStore.delete(ACTIVE_PROJECT_KEY);
    }

    await transactionDone(transaction);
  }
}

export const localProjectDatabase = new LocalProjectDatabase();
