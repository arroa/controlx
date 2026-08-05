/**
 * Fuerza BLOB_READ_WRITE_TOKEN en Vercel Production + Preview desde .env.local.
 * Windows-friendly (pipe desde archivo temporal).
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

function loadLocalToken() {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith("BLOB_READ_WRITE_TOKEN=")) continue;
    let value = line.slice("BLOB_READ_WRITE_TOKEN=".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: true,
    ...opts,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

const token = loadLocalToken();
if (!token || !token.startsWith("vercel_blob_rw_") || token.length < 20) {
  console.error("Token local inválido");
  process.exit(1);
}
console.log(`Token local OK len=${token.length}`);

const tmp = join(tmpdir(), `blob-token-${Date.now()}.txt`);
writeFileSync(tmp, token, "utf8");

try {
  for (const env of ["production", "preview"]) {
    console.log(`\n→ ${env}`);
    run("npx", ["vercel", "env", "rm", "BLOB_READ_WRITE_TOKEN", env, "--yes"]);
    // Pipe file contents into vercel env add (no newline issues from echo)
    const status = run(
      "cmd",
      ["/c", `type "${tmp}" | npx vercel env add BLOB_READ_WRITE_TOKEN ${env}`],
    );
    if (status !== 0) {
      console.error(`Falló add ${env}`);
      process.exit(status);
    }
  }
} finally {
  unlinkSync(tmp);
}

console.log("\nVerificando production…");
run("npx", [
  "vercel",
  "env",
  "pull",
  ".env.vercel.check",
  "--environment=production",
  "--yes",
]);
const pulled = readFileSync(".env.vercel.check", "utf8");
unlinkSync(".env.vercel.check");
const line = pulled
  .split(/\r?\n/)
  .find((l) => l.startsWith("BLOB_READ_WRITE_TOKEN="));
let v = line ? line.slice("BLOB_READ_WRITE_TOKEN=".length) : "";
if (
  (v.startsWith('"') && v.endsWith('"')) ||
  (v.startsWith("'") && v.endsWith("'"))
) {
  v = v.slice(1, -1);
}
console.log({
  len: v.length,
  startsOk: v.startsWith("vercel_blob_rw_"),
  matchesLocal: v === token,
});
if (!v || v !== token) {
  console.error("El token en Production NO quedó bien. Revisa el dashboard.");
  process.exit(1);
}
console.log("OK. Ahora hace falta redeploy de producción.");
