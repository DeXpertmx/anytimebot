/**
 * Lightweight visual test for the brand logo assets.
 *
 * Verifies that the dark-mode light variants exist, are valid PNGs with the
 * same dimensions as the originals, and that BrandLogo/BrandIcon reference
 * exactly those files (so a renamed or deleted asset fails the suite).
 *
 * Also asserts the light variants are actually lighter than the originals
 * by decoding a few opaque pixels from each PNG (RGBA, 8-bit, non-interlaced)
 * using only Node built-ins (zlib) — no image dependencies added.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

const PAIRS = [
  { original: '/anytimebot-logo.png', light: '/anytimebot-logo-light.png' },
  { original: '/Anytimebot-icon.png', light: '/anytimebot-icon-light.png' },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngInfo {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  interlace: number;
}

function readIhdr(filePath: string): PngInfo {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 33, `${filePath} is too small to be a PNG`);
  assert.ok(buf.subarray(0, 8).equals(PNG_SIGNATURE), `${filePath} is not a PNG (bad signature)`);
  const type = buf.subarray(12, 16).toString('ascii');
  assert.equal(type, 'IHDR', `${filePath}: first chunk is not IHDR`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
    bitDepth: buf[24],
    interlace: buf[28],
  };
}

/**
 * Decodes the given scanlines from a non-interlaced 8-bit RGBA PNG and returns
 * their average luminance over fully-opaque pixels (alpha >= 255). Uses only
 * zlib. Supports PNG filter types 0-4 as produced by standard encoders.
 */
function averageOpaqueLuminance(
  filePath: string,
  width: number,
  height: number,
  sampleRows: number[],
): number {
  const buf = fs.readFileSync(filePath);
  const channels = 4; // colorType 6 = RGBA
  const bpp = channels; // bytes per pixel (8-bit depth -> 1 byte per channel)
  const stride = 1 + width * bpp;

  // Collect IDAT chunks
  const idat: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  assert.ok(idat.length > 0, `${filePath}: no IDAT chunks found`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.ok(raw.length >= stride * height, `${filePath}: inflated data smaller than image`);

  const recon = (raw: Buffer, stride: number, y: number): Buffer => {
    const rowStart = y * stride;
    const filter = raw[rowStart];
    const row = raw.subarray(rowStart + 1, rowStart + stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride + 1, y * stride) : null;

    const out = Buffer.allocUnsafe(row.length);
    for (let i = 0; i < row.length; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = i >= bpp && prev ? prev[i - bpp] : 0;
      let val: number;
      switch (filter) {
        case 0: val = row[i]; break;
        case 1: val = row[i] + a; break;
        case 2: val = row[i] + b; break;
        case 3: val = row[i] + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          val = row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`${filePath}: unsupported PNG filter ${filter}`);
      }
      out[i] = val & 0xff;
    }
    return out;
  };

  let sum = 0;
  let count = 0;
  for (const y of sampleRows) {
    assert.ok(y >= 0 && y < height, `sample row ${y} out of range for ${filePath}`);
    const row = recon(raw, stride, y);
    for (let x = 0; x < width; x++) {
      const i = x * bpp;
      const alpha = row[i + 3];
      if (alpha < 255) continue; // only fully opaque pixels
      const r = row[i];
      const g = row[i + 1];
      const b = row[i + 2];
      // Rec.601 luminance
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      count++;
    }
  }
  assert.ok(count > 0, `${filePath}: no fully-opaque pixels in sampled rows`);
  return sum / count;
}

describe('brand logo assets', () => {
  test('component source references the exact light-variant filenames', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components', 'brand-logo.tsx'),
      'utf8',
    );
    assert.ok(
      source.includes('"/anytimebot-logo-light.png"'),
      'BrandLogo must reference /anytimebot-logo-light.png',
    );
    assert.ok(
      source.includes('"/anytimebot-icon-light.png"'),
      'BrandIcon must reference /anytimebot-icon-light.png',
    );
    assert.ok(
      source.includes('dark:hidden') && source.includes('hidden dark:block'),
      'BrandLogo must toggle variants via dark: classes',
    );
  });

  for (const { original, light } of PAIRS) {
    const originalPath = path.join(PUBLIC_DIR, original.replace(/^\//, ''));
    const lightPath = path.join(PUBLIC_DIR, light.replace(/^\//, ''));

    test(`light variant exists and is a valid PNG: ${light}`, () => {
      assert.ok(fs.existsSync(lightPath), `${light} is missing from /public`);
      const info = readIhdr(lightPath);
      assert.ok(info.width > 0 && info.height > 0, `${light} has invalid dimensions`);
      assert.equal(info.interlace, 0, `${light}: interlaced PNGs are not supported by this test`);
    });

    test(`light variant matches original dimensions: ${light}`, () => {
      const a = readIhdr(originalPath);
      const b = readIhdr(lightPath);
      assert.equal(b.width, a.width, `width differs between ${original} and ${light}`);
      assert.equal(b.height, a.height, `height differs between ${original} and ${light}`);
    });

    test(`light variant is actually lighter than original: ${light}`, () => {
      const a = readIhdr(originalPath);
      const b = readIhdr(lightPath);
      assert.equal(a.colorType, 6, `${original}: expected RGBA PNG (colorType 6)`);
      assert.equal(b.colorType, 6, `${light}: expected RGBA PNG (colorType 6)`);
      assert.equal(a.bitDepth, 8, `${original}: expected 8-bit depth`);
      assert.equal(b.bitDepth, 8, `${light}: expected 8-bit depth`);

      // Sample 5 evenly spaced rows across the artwork
      const rows = [0.2, 0.4, 0.5, 0.6, 0.8].map((f) => Math.floor(f * a.height));
      const lumOriginal = averageOpaqueLuminance(originalPath, a.width, a.height, rows);
      const lumLight = averageOpaqueLuminance(lightPath, b.width, b.height, rows);

      assert.ok(
        lumLight > lumOriginal,
        `${light} (lum ${lumLight.toFixed(1)}) must be lighter than ${original} (lum ${lumOriginal.toFixed(1)})`,
      );
    });
  }
});
