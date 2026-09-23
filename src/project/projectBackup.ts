import type {
  SampleAssetState,
} from "../audio/SampleAssetStore";
import {
  assertProjectDocument,
  type LoadedProjectBundle,
  type PersistedAudioAsset,
  type ProjectBackupAssetIndexEntry,
  type ProjectBackupManifestV1,
  type SynthProjectDocument,
} from "./projectTypes";
import {
  createStoreZip,
  parseStoreZip,
  type ZipEntry,
} from "../render/zipStore";

const BACKUP_FORMAT = "synth-project-package";
const BACKUP_VERSION = 1;

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify(value, null, 2),
  );
}

function parseJson<T>(
  entries: Map<string, Uint8Array>,
  path: string,
): T {
  const bytes = entries.get(path);
  if (!bytes) {
    throw new Error("Backup entry is missing: " + path);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);
  } catch {
    throw new Error("Backup JSON is not valid UTF-8: " + path);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Backup JSON is invalid: " + path);
  }
}

async function sha256Hex(
  bytes: Uint8Array,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Web Crypto is required to verify Synth backups.",
    );
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    copy.buffer,
  );

  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function safeAssetPathId(assetId: string): string {
  if (!/^audio-[a-f0-9]{24}$/i.test(assetId)) {
    throw new Error(
      "Backup contains an invalid audio asset ID: " + assetId,
    );
  }
  return assetId;
}

function normalizedAssetState(
  state: SampleAssetState,
): SampleAssetState {
  return {
    reference: { ...state.reference },
    decodeStatus: "raw",
    waveform: [...state.waveform],
    lastError: undefined,
  };
}

function equalSets(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return (
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  );
}

export async function createProjectBackup(
  bundle: LoadedProjectBundle,
): Promise<Blob> {
  assertProjectDocument(bundle.document);

  const assetsById = new Map(
    bundle.assets.map((asset) => [
      asset.id,
      asset,
    ]),
  );

  if (
    !bundle.document.assetIds.every((assetId) =>
      assetsById.has(assetId),
    )
  ) {
    throw new Error(
      "Cannot create backup because a referenced audio asset is missing.",
    );
  }

  const assetIndex: ProjectBackupAssetIndexEntry[] = [];
  const entries: ZipEntry[] = [
    {
      name: "project.json",
      bytes: jsonBytes(bundle.document),
    },
  ];

  for (const assetId of bundle.document.assetIds) {
    const safeId = safeAssetPathId(assetId);
    const asset = assetsById.get(assetId)!;
    const expectedHash = asset.state.reference.contentHash;
    if (expectedHash) {
      const actualHash = await sha256Hex(
        new Uint8Array(asset.bytes),
      );
      if (actualHash !== expectedHash) {
        throw new Error(
          "Audio asset failed SHA-256 verification: " + assetId,
        );
      }
    }

    const stateFile = "assets/" + safeId + ".json";
    const dataFile = "assets/" + safeId + ".bin";
    assetIndex.push({
      id: safeId,
      stateFile,
      dataFile,
    });

    entries.push(
      {
        name: stateFile,
        bytes: jsonBytes(
          normalizedAssetState(asset.state),
        ),
      },
      {
        name: dataFile,
        bytes: new Uint8Array(asset.bytes.slice(0)),
      },
    );
  }

  const manifest: ProjectBackupManifestV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    projectFile: "project.json",
    assetIndexFile: "assets.json",
    projectId: bundle.document.id,
    projectName: bundle.document.name,
    assetCount: assetIndex.length,
  };

  entries.unshift(
    {
      name: "manifest.json",
      bytes: jsonBytes(manifest),
    },
    {
      name: "assets.json",
      bytes: jsonBytes(assetIndex),
    },
  );

  return createStoreZip(entries);
}

export async function readProjectBackup(
  blob: Blob,
): Promise<LoadedProjectBundle> {
  const entries = await parseStoreZip(blob);
  const manifest = parseJson<ProjectBackupManifestV1>(
    entries,
    "manifest.json",
  );

  if (
    manifest.format !== BACKUP_FORMAT ||
    manifest.version !== BACKUP_VERSION ||
    manifest.projectFile !== "project.json" ||
    manifest.assetIndexFile !== "assets.json"
  ) {
    throw new Error(
      "This file is not a supported Synth project package.",
    );
  }

  const document = parseJson<SynthProjectDocument>(
    entries,
    manifest.projectFile,
  );
  assertProjectDocument(document);

  const assetIndex =
    parseJson<ProjectBackupAssetIndexEntry[]>(
      entries,
      manifest.assetIndexFile,
    );

  if (!Array.isArray(assetIndex)) {
    throw new Error("Backup asset index is invalid.");
  }
  if (
    assetIndex.length !== manifest.assetCount ||
    !equalSets(
      document.assetIds,
      assetIndex.map((entry) => entry.id),
    )
  ) {
    throw new Error(
      "Backup asset manifest does not match the project document.",
    );
  }

  const assets: PersistedAudioAsset[] = [];

  for (const entry of assetIndex) {
    const assetId = safeAssetPathId(entry.id);
    const expectedStateFile =
      "assets/" + assetId + ".json";
    const expectedDataFile =
      "assets/" + assetId + ".bin";

    if (
      entry.stateFile !== expectedStateFile ||
      entry.dataFile !== expectedDataFile
    ) {
      throw new Error(
        "Backup asset path does not match its content ID.",
      );
    }

    const state = parseJson<SampleAssetState>(
      entries,
      entry.stateFile,
    );
    if (
      !state ||
      state.reference?.id !== assetId ||
      state.reference.kind !== "audio"
    ) {
      throw new Error(
        "Backup asset metadata is invalid: " + assetId,
      );
    }

    const bytes = entries.get(entry.dataFile);
    if (!bytes || bytes.byteLength <= 0) {
      throw new Error(
        "Backup audio bytes are missing: " + assetId,
      );
    }

    const expectedHash = state.reference.contentHash;
    const actualHash = await sha256Hex(bytes);
    if (
      expectedHash &&
      actualHash !== expectedHash
    ) {
      throw new Error(
        "Backup audio SHA-256 mismatch: " + assetId,
      );
    }

    const bytesCopy = new Uint8Array(bytes.byteLength);
    bytesCopy.set(bytes);

    assets.push({
      id: assetId,
      state: normalizedAssetState(state),
      bytes: bytesCopy.buffer,
      updatedAt: manifest.exportedAt,
    });
  }

  return {
    document: structuredClone(document),
    assets,
  };
}
