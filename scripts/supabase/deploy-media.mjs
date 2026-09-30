#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODES = new Set(["validate", "upload", "verify"]);
const mode = process.argv[2] || "validate";
const manifestArgument = process.argv[3] || "supabase/storage-assets/manifest.json";

if (!MODES.has(mode)) {
  throw new Error(`Unknown mode "${mode}". Use validate, upload, or verify.`);
}

const repositoryRoot = process.cwd();
const manifestPath = path.resolve(repositoryRoot, manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function encodeObjectPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function publicObjectUrl(baseUrl, asset) {
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(asset.bucket)}/${encodeObjectPath(asset.objectPath)}`;
}

function apiHeaders(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    ...extra,
  };
}

function validateManifest() {
  assert(manifest.version === 1, "Manifest version must be 1.");
  assert(Array.isArray(manifest.migrations), "Manifest migrations must be an array.");
  for (const migration of manifest.migrations) {
    assert(/^\d{14}_[a-z0-9_]+[.]sql$/.test(migration), `Invalid migration filename: ${migration}`);
  }
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0, "Manifest must contain assets.");
  assert(Array.isArray(manifest.exerciseMedia), "Manifest exerciseMedia must be an array.");

  const destinations = new Set();
  for (const asset of manifest.assets) {
    assert(typeof asset.source === "string" && asset.source.length > 0, "Each asset needs a source.");
    assert(typeof asset.bucket === "string" && /^[a-z0-9-]+$/.test(asset.bucket), `Invalid bucket: ${asset.bucket}`);
    assert(typeof asset.objectPath === "string" && !asset.objectPath.startsWith("/"), `Invalid objectPath: ${asset.objectPath}`);
    assert(!asset.objectPath.includes(".."), `objectPath cannot contain '..': ${asset.objectPath}`);
    assert(typeof asset.contentType === "string" && /^(image\/(png|webp)|video\/mp4)$/.test(asset.contentType), `Unsupported content type: ${asset.contentType}`);
    assert(Number.isInteger(asset.cacheControl) && asset.cacheControl >= 0, `Invalid cacheControl for ${asset.source}`);

    const destination = `${asset.bucket}/${asset.objectPath}`;
    assert(!destinations.has(destination), `Duplicate manifest destination: ${destination}`);
    destinations.add(destination);
  }

  for (const expected of manifest.exerciseMedia) {
    assert(typeof expected.name === "string" && expected.name.length > 0, "Each exerciseMedia entry needs a name.");
    assert(expected.imageUrl || expected.motionUrl, `${expected.name} needs an imageUrl or motionUrl.`);
  }
}

async function loadAsset(asset) {
  const sourcePath = path.resolve(repositoryRoot, asset.source);
  const relative = path.relative(repositoryRoot, sourcePath);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `Asset escapes repository: ${asset.source}`);
  const bytes = await readFile(sourcePath);
  assert(bytes.length > 0, `Asset is empty: ${asset.source}`);
  return { bytes, sourcePath };
}

async function validateLocalAssets() {
  for (const asset of manifest.assets) {
    const { bytes } = await loadAsset(asset);
    console.log(`validated ${asset.source} (${bytes.length} bytes, sha256 ${sha256(bytes).slice(0, 12)})`);
  }
}

async function uploadAssets(baseUrl, secretKey) {
  for (const asset of manifest.assets) {
    const { bytes } = await loadAsset(asset);
    const localHash = sha256(bytes);
    const publicUrl = publicObjectUrl(baseUrl, asset);
    const existing = await fetch(`${publicUrl}?sha256=${localHash}`);

    if (existing.ok) {
      const existingBytes = Buffer.from(await existing.arrayBuffer());
      assert(
        sha256(existingBytes) === localHash,
        `Refusing to overwrite ${asset.bucket}/${asset.objectPath} with different bytes. Use a new versioned path.`,
      );
      console.log(`unchanged ${asset.bucket}/${asset.objectPath}`);
      continue;
    }

    assert(
      existing.status === 400 || existing.status === 404,
      `Could not check ${asset.bucket}/${asset.objectPath}: HTTP ${existing.status}`,
    );

    const objectEndpoint = `${baseUrl}/storage/v1/object/${encodeURIComponent(asset.bucket)}/${encodeObjectPath(asset.objectPath)}`;
    const response = await fetch(objectEndpoint, {
      method: "POST",
      headers: apiHeaders(secretKey, {
        "Content-Type": asset.contentType,
        "cache-control": `max-age=${asset.cacheControl}`,
        "x-upsert": "false",
      }),
      body: bytes,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Upload failed for ${asset.bucket}/${asset.objectPath}: ${response.status} ${detail}`);
    }

    console.log(`uploaded ${asset.bucket}/${asset.objectPath} (sha256 ${localHash.slice(0, 12)})`);
  }
}

async function verifyAssets(baseUrl) {
  for (const asset of manifest.assets) {
    const { bytes } = await loadAsset(asset);
    const expectedHash = sha256(bytes);
    const response = await fetch(`${publicObjectUrl(baseUrl, asset)}?sha256=${expectedHash}`);
    assert(response.ok, `Public URL failed for ${asset.bucket}/${asset.objectPath}: HTTP ${response.status}`);
    const remoteBytes = Buffer.from(await response.arrayBuffer());
    assert(sha256(remoteBytes) === expectedHash, `Checksum mismatch for ${asset.bucket}/${asset.objectPath}`);
    console.log(`verified ${asset.bucket}/${asset.objectPath} (${remoteBytes.length} bytes)`);
  }
}

async function fetchExercise(baseUrl, secretKey, name) {
  const query = new URL(`${baseUrl}/rest/v1/exercise_library`);
  query.searchParams.set("select", "name,image_url,motion_url,demo_url");
  query.searchParams.set("name", `eq.${name}`);
  const response = await fetch(query, {
    headers: apiHeaders(secretKey, { Accept: "application/json" }),
  });
  if (!response.ok) {
    throw new Error(`Exercise verification query failed for ${name}: HTTP ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  assert(rows.length === 1, `Expected exactly one exercise_library row for ${name}; found ${rows.length}.`);
  return rows[0];
}

async function verifyExerciseMedia(baseUrl, secretKey) {
  for (const expected of manifest.exerciseMedia) {
    const row = await fetchExercise(baseUrl, secretKey, expected.name);
    if (expected.imageUrl) assert(row.image_url === expected.imageUrl, `${expected.name} image_url mismatch.`);
    if (expected.motionUrl) assert(row.motion_url === expected.motionUrl, `${expected.name} motion_url mismatch.`);
    console.log(`verified exercise mapping: ${expected.name}`);
  }
}

async function fetchProjectSecretKey(accessToken, projectId) {
  assert(accessToken.length > 20, "Set SUPABASE_ACCESS_TOKEN.");
  assert(/^[a-z0-9]{20}$/.test(projectId), "Set a valid SUPABASE_PROJECT_ID.");

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`Could not retrieve the project secret API key: HTTP ${response.status}`);
  }

  const keys = await response.json();
  const secret = keys.find((key) => key.type === "secret" && key.name === "github_actions_production")
    || keys.find((key) => key.type === "secret");
  const value = String(secret?.api_key || secret?.apiKey || secret?.key || "").trim();
  assert(value.startsWith("sb_secret_") && value.length > 20, "The project has no usable secret API key.");
  return value;
}

validateManifest();

if (mode === "validate") {
  await validateLocalAssets();
  console.log(`manifest valid: ${manifest.assets.length} assets, ${manifest.exerciseMedia.length} exercise mappings`);
  process.exit(0);
}

const baseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
const projectId = String(process.env.SUPABASE_PROJECT_ID || "").trim();
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const configuredSecretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
assert(/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/.test(baseUrl), "SUPABASE_URL must be a hosted Supabase project URL.");
const secretKey = configuredSecretKey || await fetchProjectSecretKey(accessToken, projectId);

if (mode === "upload") {
  await uploadAssets(baseUrl, secretKey);
} else {
  await verifyAssets(baseUrl);
  await verifyExerciseMedia(baseUrl, secretKey);
}
