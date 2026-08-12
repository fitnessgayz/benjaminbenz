import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const testFile = path.join(projectRoot, "supabase/tests/benjamin_ai_coach_rls_test.sql");
const dockerCandidates = [
  process.env.DOCKER_BIN,
  "docker",
  "/Applications/Docker.app/Contents/Resources/bin/docker",
].filter(Boolean);

async function resolveDockerBinary() {
  for (const candidate of dockerCandidates) {
    if (candidate === "docker") return candidate;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported Docker CLI location.
    }
  }
  throw new Error("Docker CLI not found. Start Docker Desktop and try again.");
}

function runPgTap(dockerBinary, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      dockerBinary,
      [
        "exec",
        "-i",
        "supabase_db_site-git",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
      ],
      { cwd: projectRoot, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Local database tests exited with status ${code}.\n${errors}`));
        return;
      }
      if (/^not ok\b/m.test(output) || output.includes("# Looks like")) {
        reject(new Error("One or more local pgTAP assertions failed."));
        return;
      }
      resolve();
    });
    child.stdin.end(sql);
  });
}

const dockerBinary = await resolveDockerBinary();
const sql = await readFile(testFile, "utf8");
await runPgTap(dockerBinary, sql);
