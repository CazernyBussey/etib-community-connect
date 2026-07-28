import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close(() => resolve(address.port));
    });
  });
}

test("an existing legacy database upgrades without losing user records", async (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "etib-migration-"));
  const databasePath = path.join(tempDir, "legacy.db");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (full_name, email, phone, password_hash, role)
    VALUES ('Legacy Owner', 'legacy@example.com', '202-555-0199', 'legacy-hash', 'owner');
  `);
  legacy.close();

  const port = await availablePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
      NODE_ENV: "test",
      JWT_SECRET: "test-only-secret-that-is-longer-than-thirty-two-characters"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += String(chunk); });

  context.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 1500);
      });
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(healthy, true, errors);

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));

  const upgraded = new DatabaseSync(databasePath);
  const columns = upgraded.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  const owner = upgraded.prepare(
    "SELECT full_name, email, status, is_hidden FROM users WHERE email=?"
  ).get("legacy@example.com");
  upgraded.close();

  assert.ok(columns.includes("status"));
  assert.ok(columns.includes("approved_at"));
  assert.ok(columns.includes("approved_by_user_id"));
  assert.ok(columns.includes("is_hidden"));
  assert.deepEqual(
    { ...owner },
    { full_name: "Legacy Owner", email: "legacy@example.com", status: "pending", is_hidden: 0 }
  );
});
