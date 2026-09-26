/* Profile photos are decoded and re-encoded; original image metadata is never uploaded. */
(function (root) {
  "use strict";

  const MAX_INPUT_BYTES = 30 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 1024 * 1024;
  const MAX_EDGE = 512;
  const unsupportedMessage = "This photo could not be opened. Try a JPEG or PNG image.";

  async function validateFile(file) {
    if (!file || !Number.isFinite(file.size) || file.size <= 0 || typeof file.slice !== "function") {
      throw new Error("Choose a photo that is not empty.");
    }
    if (file.size > MAX_INPUT_BYTES) throw new Error("Choose a photo smaller than 30 MB.");
    const type = String(file.type || "").toLowerCase().split(";")[0].trim();
    if (type && !/^image\/(jpeg|jpg|png|gif|webp|bmp|x-ms-bmp|avif|heic|heif|heic-sequence|heif-sequence|tiff)$/.test(type)) {
      throw new Error("Choose a photo such as a JPEG or PNG image.");
    }
    // Check the file itself as well as its declared type, so SVG renamed as a photo is rejected.
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer()); }
    catch (_) { throw new Error(unsupportedMessage); }
    const text = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
    const matches = (signature) => signature.every((value, index) => bytes[index] === value);
    const jpeg = matches([0xff, 0xd8, 0xff]);
    const png = matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const gif = ["GIF87a", "GIF89a"].includes(text(0, 6));
    const webp = text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
    const bmp = text(0, 2) === "BM";
    const tiff = matches([0x49, 0x49, 0x2a, 0]) || matches([0x4d, 0x4d, 0, 0x2a]);
    const brands = [];
    if (text(4, 4) === "ftyp") {
      brands.push(text(8, 4));
      for (let offset = 16; offset + 4 <= bytes.length; offset += 4) brands.push(text(offset, 4));
    }
    const heif = brands.some((brand) => ["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand));
    if (!(jpeg || png || gif || webp || bmp || tiff || heif)) throw new Error(unsupportedMessage);
  }

  async function decode(file) {
    if (typeof root.createImageBitmap === "function") {
      try {
        // Orient before cropping; the resulting canvas contains pixels, not EXIF orientation.
        const bitmap = await root.createImageBitmap(file, { imageOrientation: "from-image" });
        return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      } catch (_) {
        // Some browsers support formats in <img> that createImageBitmap cannot decode.
      }
    }
    if (typeof root.Image !== "function" || !root.URL?.createObjectURL || !root.URL?.revokeObjectURL) {
      throw new Error(unsupportedMessage);
    }
    return new Promise((resolve, reject) => {
      let image;
      let url;
      const release = () => {
        if (image) { image.onload = null; image.onerror = null; image.src = ""; }
        if (url) { root.URL.revokeObjectURL(url); url = null; }
      };
      try {
        image = new root.Image();
        image.decoding = "async";
        url = root.URL.createObjectURL(file);
        image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, release });
        image.onerror = () => { release(); reject(new Error(unsupportedMessage)); };
        image.src = url;
      } catch (_) {
        release();
        reject(new Error(unsupportedMessage));
      }
    });
  }

  function encode(canvas, quality) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob || blob.type !== "image/jpeg" || !Number.isFinite(blob.size) || blob.size <= 0) {
            reject(new Error("This photo could not be prepared. Try another photo."));
          } else resolve(blob);
        }, "image/jpeg", quality);
      } catch (_) { reject(new Error("This photo could not be prepared. Try another photo.")); }
    });
  }

  async function prepare(file) {
    await validateFile(file);
    const decoded = await decode(file);
    let canvas;
    try {
      const { width, height } = decoded;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
        throw new Error(unsupportedMessage);
      }
      const cropEdge = Math.min(width, height);
      const edge = Math.min(MAX_EDGE, Math.floor(cropEdge));
      canvas = root.document.createElement("canvas");
      canvas.width = edge;
      canvas.height = edge;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Photo editing is unavailable in this browser. Try another browser.");
      // Transparent raster photos get a consistent background in JPEG.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, edge, edge);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      try {
        context.drawImage(decoded.image, (width - cropEdge) / 2, (height - cropEdge) / 2, cropEdge, cropEdge, 0, 0, edge, edge);
      } catch (_) {
        throw new Error("This photo could not be prepared. Try another photo.");
      }
      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await encode(canvas, quality);
        if (blob.size <= MAX_OUTPUT_BYTES) return blob;
      }
      throw new Error("This photo is too large after resizing. Try another photo.");
    } finally {
      decoded.release();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  const api = { prepare };
  root.FWB_PROFILE_PHOTO_PROCESSOR = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
