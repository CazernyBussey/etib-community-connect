import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ quiet: true });

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function createAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const configuredPhone = String(process.env.ADMIN_PHONE || "").trim();
  const configuredName = String(process.env.ADMIN_NAME || "ETIB Administrator").trim();
  if (!validEmail(email)) throw new Error("Set ADMIN_EMAIL to a valid administrator email first.");

  const persistentPath = process.env.DB_PATH ||
    (process.env.RENDER_DISK_MOUNT_PATH ? path.join(process.env.RENDER_DISK_MOUNT_PATH, "etib.db") : "");
  const databasePath = persistentPath || path.join(dirname, "etib.db");
  if (persistentPath) fs.mkdirSync(path.dirname(persistentPath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  try {
    const schema = fs.readFileSync(path.join(dirname, "schema.sql"), "utf8");
    try { database.exec(schema); } catch {}
    for (const statement of [
      "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
      "ALTER TABLE users ADD COLUMN approved_at TEXT",
      "ALTER TABLE users ADD COLUMN approved_by_user_id INTEGER",
      "ALTER TABLE users ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0"
    ]) {
      try { database.exec(statement); } catch {}
    }

    const existing = database.prepare(
      "SELECT id, full_name, phone FROM users WHERE lower(email)=lower(?)"
    ).get(email);
    const phone = String(existing?.phone || configuredPhone).trim();
    if (!validPhone(phone)) {
      throw new Error("Set ADMIN_PHONE to a valid 10-to-15-digit phone number for the new administrator.");
    }

    const temporaryPassword = `${crypto.randomBytes(18).toString("base64url")}!A1`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    if (existing) {
      database.prepare(
        `UPDATE users
         SET role='admin', status='approved', approved_at=datetime('now'),
             approved_by_user_id=NULL, is_hidden=0, password_hash=?
         WHERE id=?`
      ).run(passwordHash, existing.id);
    } else {
      database.prepare(
        `INSERT INTO users
         (full_name, email, phone, password_hash, role, status, approved_at, approved_by_user_id, is_hidden)
         VALUES (?, ?, ?, ?, 'admin', 'approved', datetime('now'), NULL, 0)`
      ).run(configuredName || "ETIB Administrator", email, phone, passwordHash);
    }

    process.stdout.write(
      `Administrator ready: ${email}\nTemporary password: ${temporaryPassword}\n` +
      "Sign in immediately, set a new password, and do not store the temporary password.\n"
    );
  } finally {
    database.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  createAdmin().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { createAdmin };
