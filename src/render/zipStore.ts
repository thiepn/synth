interface ZipEntry {
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
