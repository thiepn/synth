export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) !== 0
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function dosTimeDate(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createStoreZip(
  entries: readonly ZipEntry[],
): Blob {
  const now = dosTimeDate(new Date());
  const localParts: ArrayBuffer[] = [];
  const centralParts: ArrayBuffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const checksum = crc32(entry.bytes);
    const local = new ArrayBuffer(30 + name.length);
    const lv = new DataView(local);

    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, entry.bytes.byteLength, true);
    lv.setUint32(22, entry.bytes.byteLength, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    new Uint8Array(local, 30).set(name);

    localParts.push(local, ownedArrayBuffer(entry.bytes));

    const central = new ArrayBuffer(46 + name.length);
    const cv = new DataView(central);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, entry.bytes.byteLength, true);
    cv.setUint32(24, entry.bytes.byteLength, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    new Uint8Array(central, 46).set(name);

    centralParts.push(central);
    localOffset += local.byteLength + entry.bytes.byteLength;
  }

  const centralOffset = localOffset;
  const centralSize = centralParts.reduce(
    (sum, part) => sum + part.byteLength,
    0,
  );
  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);

  return new Blob(
    [...localParts, ...centralParts, end],
    { type: "application/zip" },
  );
}

export async function blobZipEntry(
  name: string,
  blob: Blob,
): Promise<ZipEntry> {
  return {
    name,
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}


const MAX_PARSE_ENTRIES = 512;
const MAX_PARSE_BYTES = 1024 * 1024 * 1024;

function safeZipPath(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 240 &&
    !name.startsWith("/") &&
    !name.startsWith("\\") &&
    !name.includes("\\") &&
    !name.split("/").some((part) => part === "..")
  );
}

function findEndOfCentralDirectory(
  bytes: Uint8Array,
): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

export async function parseStoreZip(
  blob: Blob,
): Promise<Map<string, Uint8Array>> {
  if (blob.size <= 0 || blob.size > MAX_PARSE_BYTES) {
    throw new Error("ZIP package size is invalid or too large.");
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error("ZIP end-of-central-directory record is missing.");
  }

  const disk = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    throw new Error("Multi-disk ZIP packages are not supported.");
  }
  if (entryCount > MAX_PARSE_ENTRIES) {
    throw new Error("ZIP package contains too many entries.");
  }
  if (
    centralOffset + centralSize > bytes.byteLength ||
    centralOffset < 0
  ) {
    throw new Error("ZIP central directory is out of bounds.");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  let totalBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > bytes.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    ) {
      throw new Error("ZIP central directory entry is invalid.");
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nextCursor =
      cursor + 46 + nameLength + extraLength + commentLength;

    if (nextCursor > bytes.byteLength) {
      throw new Error("ZIP entry metadata is out of bounds.");
    }
    if (method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error(
        "Only uncompressed Synth ZIP entries are supported.",
      );
    }
    if ((flags & 0x0008) !== 0) {
      throw new Error("ZIP data descriptors are not supported.");
    }

    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (!safeZipPath(name) || result.has(name)) {
      throw new Error("ZIP contains an unsafe or duplicate path.");
    }

    if (
      localOffset + 30 > bytes.byteLength ||
      view.getUint32(localOffset, true) !== 0x04034b50
    ) {
      throw new Error("ZIP local entry header is invalid.");
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart =
      localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + uncompressedSize;

    if (dataEnd > bytes.byteLength) {
      throw new Error("ZIP entry payload is out of bounds.");
    }

    totalBytes += uncompressedSize;
    if (totalBytes > MAX_PARSE_BYTES) {
      throw new Error("ZIP uncompressed payload is too large.");
    }

    const payload = new Uint8Array(uncompressedSize);
    payload.set(bytes.subarray(dataStart, dataEnd));
    if (crc32(payload) !== checksum) {
      throw new Error("ZIP entry checksum failed: " + name);
    }

    result.set(name, payload);
    cursor = nextCursor;
  }

  return result;
}
