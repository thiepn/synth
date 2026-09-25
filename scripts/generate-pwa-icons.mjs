import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../public/icons");

const COLORS = {
  background: [13, 14, 26, 255],
  ring: [120, 103, 255, 255],
  signal: [255, 85, 119, 255],
  accent: [99, 222, 244, 255],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc >>> 1) ^
        ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    8 + data.length,
  );
  return output;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((px - ax) * dx + (py - ay) * dy) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    px - (ax + t * dx),
    py - (ay + t * dy),
  );
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    pixels[offset] = COLORS.background[0];
    pixels[offset + 1] = COLORS.background[1];
    pixels[offset + 2] = COLORS.background[2];
    pixels[offset + 3] = 255;
  }

  const paint = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };

  const center = size / 2;
  const ringRadius = size * 0.30;
  const ringWidth = Math.max(4, size * 0.037);
  const inner = ringRadius - ringWidth / 2;
  const outer = ringRadius + ringWidth / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(
        x + 0.5 - center,
        y + 0.5 - center,
      );
      if (distance >= inner && distance <= outer) {
        paint(x, y, COLORS.ring);
      }
    }
  }

  const points = [
    [0.24, 0.56],
    [0.345, 0.56],
    [0.395, 0.33],
    [0.48, 0.70],
    [0.556, 0.39],
    [0.611, 0.56],
    [0.756, 0.56],
  ].map(([x, y]) => [x * size, y * size]);

  const halfWidth = Math.max(5, size * 0.029);
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const [ax, ay] = points[segment];
    const [bx, by] = points[segment + 1];
    const minX = Math.max(
      0,
      Math.floor(Math.min(ax, bx) - halfWidth),
    );
    const maxX = Math.min(
      size - 1,
      Math.ceil(Math.max(ax, bx) + halfWidth),
    );
    const minY = Math.max(
      0,
      Math.floor(Math.min(ay, by) - halfWidth),
    );
    const maxY = Math.min(
      size - 1,
      Math.ceil(Math.max(ay, by) + halfWidth),
    );

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (
          distanceToSegment(
            x + 0.5,
            y + 0.5,
            ax,
            ay,
            bx,
            by,
          ) <= halfWidth
        ) {
          paint(x, y, COLORS.signal);
        }
      }
    }
  }

  const dotRadius = Math.max(4, size * 0.037);
  for (
    let y = Math.floor(center - dotRadius);
    y <= Math.ceil(center + dotRadius);
    y += 1
  ) {
    for (
      let x = Math.floor(center - dotRadius);
      x <= Math.ceil(center + dotRadius);
      x += 1
    ) {
      if (
        Math.hypot(
          x + 0.5 - center,
          y + 0.5 - center,
        ) <= dotRadius
      ) {
        paint(x, y, COLORS.accent);
      }
    }
  }

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    pixels.copy(
      raw,
      row + 1,
      y * stride,
      (y + 1) * stride,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
    ]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND"),
  ]);
}

mkdirSync(output, { recursive: true });

for (const size of [180, 192, 512]) {
  writeFileSync(
    resolve(output, "synth-" + size + ".png"),
    drawIcon(size),
  );
}

console.log("Generated Synth PWA icons: 180, 192, 512.");
