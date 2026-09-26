const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../js/profile-photo-processor.js"), "utf8");
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0])], { type: "image/jpeg" });

function harness(options = {}) {
  const calls = { draws: [], fills: [], encoded: [], closed: 0, revoked: [], created: [], bitmap: [] };
  const context = {
    fillRect(...args) { calls.fills.push(args); },
    drawImage(...args) { calls.draws.push(args); if (options.drawError) throw new Error("draw failed"); }
  };
  const canvas = {
    getContext: () => options.noContext ? null : context,
    toBlob(callback, type, quality) {
      calls.encoded.push({ type, quality, width: canvas.width, height: canvas.height });
      if (options.encodeError) throw new Error("SecurityError");
      const output = options.outputs?.shift();
      callback(output === undefined ? new Blob(["encoded pixels"], { type: "image/jpeg" }) : output);
    }
  };
  const bitmap = { width: options.width ?? 1200, height: options.height ?? 800, close() { calls.closed++; } };
  const window = {
    document: { createElement(name) { assert.equal(name, "canvas"); return canvas; } },
    async createImageBitmap(file, settings) {
      calls.bitmap.push({ file, settings });
      if (options.bitmapError) throw new Error("not supported");
      return bitmap;
    },
    URL: {
      createObjectURL(file) { calls.created.push(file); return "blob:photo-test"; },
      revokeObjectURL(url) { calls.revoked.push(url); }
    },
    Image: class {
      naturalWidth = options.width ?? 1200;
      naturalHeight = options.height ?? 800;
      set src(value) {
        this.currentSrc = value;
        if (value) queueMicrotask(() => options.imageError ? this.onerror?.() : this.onload?.());
      }
    }
  };
  if (options.noBitmap) delete window.createImageBitmap;
  if (options.noImage) delete window.Image;
  const sandbox = { window, module: { exports: {} }, Uint8Array, Blob };
  vm.runInNewContext(source, sandbox);
  return { api: window.FWB_PROFILE_PHOTO_PROCESSOR, commonjs: sandbox.module.exports, calls, canvas, context, bitmap };
}

test("exports the same async processor for browser and CommonJS", () => {
  const h = harness();
  assert.equal(h.api, h.commonjs);
  assert.equal(typeof require("../js/profile-photo-processor.js").prepare, "function");
});

test("orients before center-cropping landscape photos to a 512px JPEG", async () => {
  const h = harness();
  const file = jpeg();
  const result = await h.api.prepare(file);
  assert.equal(result.type, "image/jpeg");
  assert.notEqual(result, file);
  assert.equal(await result.text(), "encoded pixels");
  assert.equal(h.calls.bitmap[0].settings.imageOrientation, "from-image");
  assert.deepEqual(h.calls.draws[0].slice(1), [200, 0, 800, 800, 0, 0, 512, 512]);
  assert.deepEqual(h.calls.fills, [[0, 0, 512, 512]]);
  assert.equal(h.context.fillStyle, "#ffffff");
  assert.deepEqual(h.calls.encoded, [{ type: "image/jpeg", quality: 0.85, width: 512, height: 512 }]);
  assert.equal(h.calls.closed, 1);
  assert.equal(h.canvas.width, 0);
  assert.equal(h.canvas.height, 0);
});

test("center-crops portraits without upscaling small photos", async () => {
  const h = harness({ width: 200, height: 401 });
  await h.api.prepare(jpeg());
  assert.deepEqual(h.calls.draws[0].slice(1), [0, 100.5, 200, 200, 0, 0, 200, 200]);
});

test("rejects empty and oversized inputs before decoding", async () => {
  const h = harness();
  for (const file of [null, new Blob([]), { size: NaN }, { size: 1 }]) {
    await assert.rejects(h.api.prepare(file), /not empty/);
  }
  await assert.rejects(h.api.prepare({ size: 30 * 1024 * 1024 + 1, slice() {} }), /30 MB/);
  assert.equal(h.calls.bitmap.length, 0);
});

test("accepts the 30MiB input boundary", async () => {
  const h = harness();
  await h.api.prepare({ size: 30 * 1024 * 1024, type: "image/jpeg", slice: () => jpeg() });
  assert.equal(h.calls.bitmap.length, 1);
});

test("rejects SVG, non-images, and mislabeled vector content before decoding", async () => {
  const h = harness();
  for (const file of [new Blob(["<svg/>"], { type: "image/svg+xml" }), new Blob(["notes"], { type: "text/plain" }), new Blob(["<svg/>"], { type: "image/jpeg" }), new Blob(["not a photo"], { type: "image/png" })]) {
    await assert.rejects(h.api.prepare(file), /JPEG or PNG/);
  }
  assert.equal(h.calls.bitmap.length, 0);
});

test("recognizes supported raster signatures even if the OS omits the MIME type", async () => {
  const inputs = [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    Array.from(Buffer.from("GIF89a")), Array.from(Buffer.from("RIFF0000WEBP")),
    Array.from(Buffer.from("BM")), [0x49, 0x49, 0x2a, 0],
    Array.from(Buffer.from("0000ftypavif0000mif1")), Array.from(Buffer.from("0000ftypheic0000mif1"))
  ];
  for (const bytes of inputs) {
    const h = harness();
    await h.api.prepare(new Blob([new Uint8Array(bytes)]));
    assert.equal(h.calls.bitmap.length, 1);
  }
});

test("falls back to Image decoding and revokes its local URL after use", async () => {
  for (const options of [{ noBitmap: true }, { bitmapError: true }]) {
    const h = harness(options);
    await h.api.prepare(jpeg());
    assert.equal(h.calls.created.length, 1);
    assert.deepEqual(h.calls.revoked, ["blob:photo-test"]);
    assert.equal(h.calls.draws[0][0].currentSrc, "");
    assert.equal(h.calls.closed, 0);
  }
});

test("gives an actionable error for unsupported HEIC and releases failed Image decoding", async () => {
  const h = harness({ bitmapError: true, imageError: true });
  const file = new Blob(["0000ftypheic0000mif1"], { type: "image/heic" });
  await assert.rejects(h.api.prepare(file), /could not be opened.*JPEG or PNG/);
  assert.deepEqual(h.calls.revoked, ["blob:photo-test"]);
  assert.equal(h.calls.draws.length, 0);
});

test("reports browsers without any supported decoder", async () => {
  const h = harness({ noBitmap: true, noImage: true });
  await assert.rejects(h.api.prepare(jpeg()), /JPEG or PNG/);
});

test("closes decoded bitmaps on invalid dimensions, missing canvas, and drawing failures", async () => {
  for (const options of [{ width: 0 }, { height: Infinity }, { noContext: true }, { drawError: true }]) {
    const h = harness(options);
    await assert.rejects(h.api.prepare(jpeg()));
    assert.equal(h.calls.closed, 1);
  }
});

test("releases Image resources even when drawing fails", async () => {
  const h = harness({ noBitmap: true, drawError: true });
  await assert.rejects(h.api.prepare(jpeg()));
  assert.deepEqual(h.calls.revoked, ["blob:photo-test"]);
  assert.equal(h.canvas.width, 0);
});

test("rejects failed, empty or non-JPEG encodes and closes the bitmap", async () => {
  for (const options of [{ outputs: [null] }, { outputs: [new Blob([] , { type: "image/jpeg" })] }, { outputs: [new Blob(["png"], { type: "image/png" })] }, { encodeError: true }]) {
    const h = harness(options);
    await assert.rejects(h.api.prepare(jpeg()), /could not be prepared/);
    assert.equal(h.calls.closed, 1);
    assert.equal(h.canvas.width, 0);
  }
});

test("lowers JPEG quality when needed and accepts the 1MiB output boundary", async () => {
  const oversized = { type: "image/jpeg", size: 1024 * 1024 + 1 };
  const bounded = { type: "image/jpeg", size: 1024 * 1024 };
  const h = harness({ outputs: [oversized, bounded] });
  assert.equal(await h.api.prepare(jpeg()), bounded);
  assert.deepEqual(h.calls.encoded.map((call) => call.quality), [0.85, 0.7]);
  assert.equal(h.calls.closed, 1);
});

test("rejects output still larger than 1MiB without returning the original photo", async () => {
  const h = harness({ outputs: Array(3).fill({ type: "image/jpeg", size: 1024 * 1024 + 1 }) });
  await assert.rejects(h.api.prepare(jpeg()), /too large after resizing/);
  assert.equal(h.calls.encoded.length, 3);
  assert.equal(h.calls.closed, 1);
});
