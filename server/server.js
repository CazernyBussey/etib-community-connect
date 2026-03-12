import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "replace-me";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "ETIB Community Connect <no-reply@eventhoughimblind.com>";

const dbPath = path.join(__dirname, "etib.db");
const schemaPath = path.join(__dirname, "schema.sql");

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

let mailer = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendMail({ to, subject, text }) {
  if (!mailer || !to) return false;
  try {
    await mailer.sendMail({ from: SMTP_FROM, to, subject, text });
    return true;
  } catch {
    return false;
  }
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  const schema = fs.readFileSync(schemaPath, "utf-8");
  await run("PRAGMA foreign_keys = ON;");
  for (const stmt of schema.split(";")) {
    const s = stmt.trim();
    if (s) await run(s + ";");
  }

  // Safe additive migration
  await run("ALTER TABLE listings ADD COLUMN moderated_by_user_id INTEGER").catch(() => {});
  await run("ALTER TABLE listings ADD COLUMN moderated_at TEXT").catch(() => {});
}
await initDb();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Missing token" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

async function ensureAdminRole(email) {
  if (!email || !ADMIN_EMAIL) return;
  if (email.toLowerCase().trim() !== ADMIN_EMAIL) return;
  await run("UPDATE users SET role='admin' WHERE lower(email)=lower(?)", [email]);
}

function validateMissionFit(listingType, supportsText) {
  const typeOk = ["Blind-Owned / Visually Impaired-Owned", "Community Service Provider", "Both"].includes(listingType);
  const supportOk = typeof supportsText === "string" && supportsText.trim().length >= 20;
  return typeOk && supportOk;
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body || {};
    if (!fullName || !email || !phone || !password) return res.status(400).json({ error: "Missing required fields" });

    const emailNorm = String(email).toLowerCase().trim();
    const passwordHash = await bcrypt.hash(String(password), 10);

    await run(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'owner')",
      [String(fullName).trim(), emailNorm, String(phone).trim(), passwordHash]
    );

    await ensureAdminRole(emailNorm);
    const user = await get("SELECT id, full_name, email, role FROM users WHERE email=?", [emailNorm]);
    const token = signToken(user);

    return res.json({ token, user });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Email already exists" });
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const emailNorm = String(email).toLowerCase().trim();
    const user = await get("SELECT * FROM users WHERE email=?", [emailNorm]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await ensureAdminRole(emailNorm);
    const refreshed = await get("SELECT id, full_name, email, role FROM users WHERE email=?", [emailNorm]);
    const token = signToken(refreshed);
    return res.json({ token, user: refreshed });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/listings", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  const listingType = String(req.query.listingType || "").trim();
  const location = String(req.query.location || "").trim().toLowerCase();
  const contact = String(req.query.contact || "").trim().toLowerCase();

  let where = "WHERE status='approved'";
  const params = [];

  if (category) { where += " AND category=?"; params.push(category); }
  if (listingType) {
    if (listingType === "Both") where += " AND listing_type='Both'";
    else { where += " AND (listing_type=? OR listing_type='Both')"; params.push(listingType); }
  }
  if (q) {
    where += " AND (lower(business_name) LIKE ? OR lower(short_summary) LIKE ? OR lower(full_description) LIKE ? OR lower(category) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (location) {
    where += " AND (lower(city || ' ' || state || ' ' || service_area_type) LIKE ?)";
    params.push(`%${location}%`);
  }
  if (contact) {
    if (contact === "call") where += " AND phone IS NOT NULL AND trim(phone) <> ''";
    if (contact === "text") where += " AND text_number IS NOT NULL AND trim(text_number) <> ''";
    if (contact === "email") where += " AND business_email IS NOT NULL AND trim(business_email) <> ''";
    if (contact === "website") where += " AND website_url IS NOT NULL AND trim(website_url) <> ''";
  }

  const rows = await all(
    `SELECT id, business_name, listing_type, category, city, state, service_area_type, short_summary, primary_contact_method
     FROM listings ${where} ORDER BY datetime(last_updated) DESC LIMIT 100`,
    params
  );

  res.json({ listings: rows });
});

app.post("/api/listings", authRequired, async (req, res) => {
  const b = req.body || {};
  const required = [
    "businessName", "ownerContactName", "businessEmail", "phone",
    "listingType", "category", "shortSummary", "fullDescription",
    "supportsBvi", "accessibilityDetails",
    "primaryContactMethod", "city", "state", "serviceAreaType", "hours"
  ];
  for (const key of required) {
    if (!b[key] || String(b[key]).trim() === "") {
      return res.status(400).json({ error: `Missing: ${key}` });
    }
  }
  if (!validateMissionFit(String(b.listingType), String(b.supportsBvi))) {
    return res.status(400).json({ error: "Mission fit not met." });
  }

  const result = await run(
    `INSERT INTO listings (
      owner_user_id, business_name, owner_contact_name, business_email, phone, text_number, website_url,
      listing_type, category, short_summary, full_description, supports_bvi, accessibility_details,
      primary_contact_method, city, state, service_area_type, hours, languages,
      remote_details, inperson_notes, social_links, certifications, testimonial,
      status, admin_note, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, datetime('now'))`,
    [
      req.user.sub,
      String(b.businessName).trim(),
      String(b.ownerContactName).trim(),
      String(b.businessEmail).trim(),
      String(b.phone).trim(),
      b.textNumber ? String(b.textNumber).trim() : null,
      b.websiteUrl ? String(b.websiteUrl).trim() : null,
      String(b.listingType).trim(),
      String(b.category).trim(),
      String(b.shortSummary).trim(),
      String(b.fullDescription).trim(),
      String(b.supportsBvi).trim(),
      String(b.accessibilityDetails).trim(),
      String(b.primaryContactMethod).trim(),
      String(b.city).trim(),
      String(b.state).trim(),
      String(b.serviceAreaType).trim(),
      String(b.hours).trim(),
      b.languages ? String(b.languages).trim() : null,
      b.remoteDetails ? String(b.remoteDetails).trim() : null,
      b.inpersonNotes ? String(b.inpersonNotes).trim() : null,
      b.socialLinks ? String(b.socialLinks).trim() : null,
      b.certifications ? String(b.certifications).trim() : null,
      b.testimonial ? String(b.testimonial).trim() : null
    ]
  );

  await sendMail({
    to: ADMIN_EMAIL,
    subject: "New ETIB Directory submission pending review",
    text: `A new listing was submitted and is pending review. Listing ID: ${result.lastID}`
  });

  res.json({ ok: true, id: result.lastID, status: "pending" });
});

app.get("/api/listings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const row = await get(
    `SELECT id, business_name, owner_contact_name, business_email, phone, text_number, website_url,
            listing_type, category, short_summary, full_description, supports_bvi, accessibility_details,
            primary_contact_method, city, state, service_area_type, hours, languages,
            remote_details, inperson_notes, social_links, certifications, testimonial, status, last_updated
     FROM listings WHERE id=? AND status='approved'`,
    [id]
  );

  if (!row) return res.status(404).json({ error: "Listing not found" });
  return res.json({ listing: row });
});

// Owner data
app.get("/api/owner/listings", authRequired, async (req, res) => {
  const rows = await all(
    `SELECT id, business_name, category, listing_type, status, admin_note, last_updated
     FROM listings WHERE owner_user_id=?
     ORDER BY datetime(last_updated) DESC`,
    [req.user.sub]
  );
  res.json({ listings: rows });
});

// Admin APIs
app.get("/api/admin/listings", authRequired, adminRequired, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();
  const params = [];
  let where = "WHERE 1=1";
  if (status) { where += " AND l.status=?"; params.push(status); }
  if (q) {
    where += " AND (lower(l.business_name) LIKE ? OR lower(l.owner_contact_name) LIKE ? OR lower(l.business_email) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const rows = await all(
    `SELECT l.id, l.business_name, l.owner_contact_name, l.business_email, l.phone, l.category, l.listing_type,
            l.status, l.admin_note, l.last_updated, l.created_at, l.short_summary, l.supports_bvi,
            u.full_name AS owner_name, u.email AS owner_email
     FROM listings l
     LEFT JOIN users u ON u.id = l.owner_user_id
     ${where}
     ORDER BY datetime(l.created_at) DESC
     LIMIT 200`,
    params
  );

  res.json({ listings: rows });
});

app.patch("/api/admin/listings/:id", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

  const { status, adminNote } = req.body || {};
  const valid = ["pending", "approved", "needs_changes", "rejected"];
  if (!valid.includes(String(status))) return res.status(400).json({ error: "Invalid status" });

  const listing = await get(
    `SELECT l.id, l.business_name, l.business_email, l.owner_user_id, u.email AS owner_email
     FROM listings l
     LEFT JOIN users u ON u.id=l.owner_user_id
     WHERE l.id=?`,
    [id]
  );
  if (!listing) return res.status(404).json({ error: "Not found" });

  await run(
    `UPDATE listings
     SET status=?, admin_note=?, moderated_by_user_id=?, moderated_at=datetime('now'), last_updated=datetime('now')
     WHERE id=?`,
    [String(status), adminNote ? String(adminNote).trim() : null, req.user.sub, id]
  );

  const to = listing.owner_email || listing.business_email;
  const business = listing.business_name;
  const notePart = adminNote ? `\n\nAdmin note:\n${adminNote}` : "";
  let subject = `ETIB listing update: ${business}`;
  let text = `Your listing \"${business}\" status is now: ${status}.`;
  if (status === "approved") {
    text = `Great news — your ETIB listing \"${business}\" was approved and is now live in the directory.`;
  } else if (status === "needs_changes") {
    text = `Your ETIB listing \"${business}\" needs changes before approval.`;
  } else if (status === "rejected") {
    text = `Your ETIB listing \"${business}\" was not approved at this time.`;
  }
  await sendMail({ to, subject, text: text + notePart });

  return res.json({ ok: true });
});

app.get("/api/admin/users", authRequired, adminRequired, async (req, res) => {
  const rows = await all("SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY datetime(created_at) DESC LIMIT 200");
  res.json({ users: rows });
});

app.get("/api/admin/reports", authRequired, adminRequired, async (req, res) => {
  const rows = await all(
    `SELECT r.id, r.listing_id, r.reporter_email, r.reason, r.created_at, l.business_name
     FROM reports r LEFT JOIN listings l ON l.id=r.listing_id
     ORDER BY datetime(r.created_at) DESC LIMIT 200`
  );
  res.json({ reports: rows });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mailer: !!mailer });
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`ETIB Community Connect running on http://localhost:${PORT}`);
});