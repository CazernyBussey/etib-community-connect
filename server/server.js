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
import rateLimit from "express-rate-limit";

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

const AUTH_RATE_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_MAX = Number(process.env.AUTH_RATE_MAX || 10);

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
    db.run(sql, params, function onRun(err) {
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
  await run("PRAGMA journal_mode = WAL;").catch(() => {});
  await run("PRAGMA busy_timeout = 5000;").catch(() => {});

  for (const stmt of schema.split(";")) {
    const s = stmt.trim();
    if (s) await run(`${s};`);
  }

  await run("ALTER TABLE listings ADD COLUMN moderated_by_user_id INTEGER").catch(() => {});
  await run("ALTER TABLE listings ADD COLUMN moderated_at TEXT").catch(() => {});
  await run("ALTER TABLE listings ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await run("ALTER TABLE listings ADD COLUMN featured_rank INTEGER").catch(() => {});
  await run("ALTER TABLE listings ADD COLUMN listen_summary TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN approved_at TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN approved_by_user_id INTEGER").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0").catch(() => {});
  await run("CREATE INDEX IF NOT EXISTS idx_listings_featured_rank ON listings(is_featured, featured_rank)").catch(() => {});
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_featured_rank
    ON listings(featured_rank)
    WHERE is_featured = 1 AND featured_rank IS NOT NULL
  `).catch(() => {});
  await run("CREATE INDEX IF NOT EXISTS idx_users_status_hidden ON users(status, is_hidden)").catch(() => {});
}
await initDb();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const authLimiter = rateLimit({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." }
});

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
  await run("UPDATE users SET role='admin', status='approved', approved_at=datetime('now') WHERE lower(email)=lower(?)", [email]);
}

function validateMissionFit(listingType, supportsText) {
  const typeOk = ["Blind-Owned / Visually Impaired-Owned", "Community Service Provider", "Both"].includes(listingType);
  const supportOk = typeof supportsText === "string" && supportsText.trim().length >= 20;
  return typeOk && supportOk;
}

function validEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function logAdminAction({ adminUserId, action, targetType, targetId = null, meta = null }) {
  await run(
    `INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, meta_json)
     VALUES (?, ?, ?, ?, ?)`,
    [adminUserId, action, targetType, targetId, meta ? JSON.stringify(meta) : null]
  ).catch(() => {});
}

app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body || {};
    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailNorm = String(email).toLowerCase().trim();
    if (!validEmail(emailNorm)) return res.status(400).json({ error: "Invalid email format" });
    if (!validPhone(phone)) return res.status(400).json({ error: "Invalid phone format" });
    if (String(password).length < 10) {
      return res.status(400).json({ error: "Password must be at least 10 characters" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    await run(
      "INSERT INTO users (full_name, email, phone, password_hash, role, status, approved_at, approved_by_user_id, is_hidden) VALUES (?, ?, ?, ?, 'owner', 'pending', NULL, NULL, 0)",
      [String(fullName).trim(), emailNorm, String(phone).trim(), passwordHash]
    );

    await ensureAdminRole(emailNorm);
    const user = await get("SELECT id, full_name, email, role, status FROM users WHERE email=?", [emailNorm]);
    const token = signToken(user);

    const adminEmailSent = await sendMail({
      to: ADMIN_EMAIL,
      subject: "New ETIB user signup pending review",
      text:
`A new user just signed up for ETIB Community Connect.

Name: ${user.full_name}
Email: ${user.email}
Status: ${user.status}

Please review this user in the admin dashboard.`
    });

    return res.json({ token, user, adminEmailSent });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "Email already exists" });
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const emailNorm = String(email).toLowerCase().trim();
    const user = await get("SELECT * FROM users WHERE email=? AND COALESCE(is_hidden, 0)=0", [emailNorm]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await ensureAdminRole(emailNorm);
    const refreshed = await get("SELECT id, full_name, email, role, status FROM users WHERE email=?", [emailNorm]);
    const token = signToken(refreshed);
    return res.json({ token, user: refreshed });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/featured-listings", async (req, res) => {
  const rows = await all(
    `SELECT l.id, l.business_name, l.listing_type, l.category, l.city, l.state, l.short_summary,
            l.phone, l.text_number, l.business_email, l.website_url, l.featured_rank,
            COALESCE(ROUND((
              SELECT AVG(r.rating) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 1), NULL) AS average_rating,
            COALESCE((
              SELECT COUNT(*) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 0) AS review_count
     FROM listings l
     WHERE l.status='approved' AND l.is_featured=1 AND l.featured_rank BETWEEN 1 AND 5
     ORDER BY l.featured_rank ASC, datetime(l.last_updated) DESC
     LIMIT 5`
  );

  res.json({ listings: rows });
});

app.get("/api/listings", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  const listingType = String(req.query.listingType || "").trim();
  const location = String(req.query.location || "").trim().toLowerCase();
  const contact = String(req.query.contact || "").trim().toLowerCase();

  let where = "WHERE l.status='approved'";
  const params = [];

  if (category) {
    where += " AND l.category=?";
    params.push(category);
  }

  if (listingType) {
    if (listingType === "Both") {
      where += " AND l.listing_type='Both'";
    } else {
      where += " AND (l.listing_type=? OR l.listing_type='Both')";
      params.push(listingType);
    }
  }

  if (q) {
    where += ` AND (
      lower(l.business_name) LIKE ? OR
      lower(l.short_summary) LIKE ? OR
      lower(l.full_description) LIKE ? OR
      lower(l.category) LIKE ?
    )`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  if (location) {
    where += " AND lower(l.city || ' ' || l.state || ' ' || l.service_area_type) LIKE ?";
    params.push(`%${location}%`);
  }

  if (contact) {
    if (contact === "call") where += " AND l.phone IS NOT NULL AND trim(l.phone) <> ''";
    if (contact === "text") where += " AND l.text_number IS NOT NULL AND trim(l.text_number) <> ''";
    if (contact === "email") where += " AND l.business_email IS NOT NULL AND trim(l.business_email) <> ''";
    if (contact === "website") where += " AND l.website_url IS NOT NULL AND trim(l.website_url) <> ''";
  }

  const rows = await all(
    `SELECT l.id, l.business_name, l.listing_type, l.category, l.city, l.state, l.service_area_type,
            l.short_summary, l.listen_summary, l.primary_contact_method,
            l.phone, l.text_number, l.business_email, l.website_url, l.is_featured, l.featured_rank,
            COALESCE(ROUND((
              SELECT AVG(r.rating) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 1), NULL) AS average_rating,
            COALESCE((
              SELECT COUNT(*) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 0) AS review_count
     FROM listings l
     ${where}
     ORDER BY l.is_featured DESC, l.featured_rank ASC, datetime(l.last_updated) DESC
     LIMIT 100`,
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

  if (!validEmail(b.businessEmail)) return res.status(400).json({ error: "Invalid business email" });
  if (!validPhone(b.phone)) return res.status(400).json({ error: "Invalid business phone" });

  const result = await run(
    `INSERT INTO listings (
      owner_user_id, business_name, owner_contact_name, business_email, phone, text_number, website_url,
      listing_type, category, short_summary, full_description, listen_summary, supports_bvi, accessibility_details,
      primary_contact_method, city, state, service_area_type, hours, languages,
      remote_details, inperson_notes, social_links, certifications, testimonial,
      status, admin_note, is_featured, featured_rank, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, datetime('now'))`,
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
      b.listenSummary ? String(b.listenSummary).trim() : null,
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
            listing_type, category, short_summary, full_description, listen_summary, supports_bvi, accessibility_details,
            primary_contact_method, city, state, service_area_type, hours, languages,
            remote_details, inperson_notes, social_links, certifications, testimonial,
            status, last_updated, is_featured, featured_rank
     FROM listings
     WHERE id=? AND status='approved'`,
    [id]
  );

  if (!row) return res.status(404).json({ error: "Listing not found" });

  const ratingSummary = await get(
    `SELECT COUNT(*) AS review_count, ROUND(AVG(rating), 1) AS average_rating
     FROM reviews
     WHERE listing_id=? AND status='approved'`,
    [id]
  );

  return res.json({
    listing: row,
    reviewsSummary: {
      reviewCount: ratingSummary?.review_count || 0,
      averageRating: ratingSummary?.average_rating || null
    }
  });
});

app.post("/api/listings/:id/reviews", async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  const listing = await get(
    "SELECT id, business_name, status FROM listings WHERE id=? AND status='approved'",
    [listingId]
  );
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  const { reviewerName, reviewerEmail, rating, reviewText } = req.body || {};

  if (!reviewerName || String(reviewerName).trim().length < 2) {
    return res.status(400).json({ error: "Reviewer name is required" });
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "Rating must be 1 through 5" });
  }

  if (!reviewText || String(reviewText).trim().length < 20) {
    return res.status(400).json({ error: "Review must be at least 20 characters" });
  }

  if (reviewerEmail && !validEmail(reviewerEmail)) {
    return res.status(400).json({ error: "Invalid reviewer email" });
  }

  const result = await run(
    `INSERT INTO reviews (listing_id, reviewer_name, reviewer_email, rating, review_text, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [
      listingId,
      String(reviewerName).trim(),
      reviewerEmail ? String(reviewerEmail).trim() : null,
      ratingNum,
      String(reviewText).trim()
    ]
  );

  await sendMail({
    to: ADMIN_EMAIL,
    subject: `New ETIB review pending moderation: ${listing.business_name}`,
    text: `A new review was submitted for "${listing.business_name}" and is pending moderation. Review ID: ${result.lastID}`
  });

  res.json({ ok: true, reviewId: result.lastID, status: "pending" });
});

app.get("/api/listings/:id/reviews", async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  const reviews = await all(
    `SELECT id, reviewer_name, rating, review_text, created_at
     FROM reviews
     WHERE listing_id=? AND status='approved'
     ORDER BY datetime(approved_at) DESC, datetime(created_at) DESC
     LIMIT 100`,
    [listingId]
  );

  const summary = await get(
    `SELECT COUNT(*) AS review_count, ROUND(AVG(rating), 1) AS average_rating
     FROM reviews
     WHERE listing_id=? AND status='approved'`,
    [listingId]
  );

  res.json({
    reviews,
    summary: {
      reviewCount: summary?.review_count || 0,
      averageRating: summary?.average_rating || null
    }
  });
});

app.get("/api/owner/listings", authRequired, async (req, res) => {
  const rows = await all(
    `SELECT id, business_name, category, listing_type, status, admin_note, is_featured, featured_rank, last_updated
     FROM listings
     WHERE owner_user_id=?
     ORDER BY datetime(last_updated) DESC`,
    [req.user.sub]
  );
  res.json({ listings: rows, userStatus: req.user.status || "pending" });
});

app.get("/api/admin/listings", authRequired, adminRequired, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();
  const params = [];
  let where = "WHERE 1=1";

  if (status) {
    where += " AND l.status=?";
    params.push(status);
  }

  if (q) {
    where += " AND (lower(l.business_name) LIKE ? OR lower(l.owner_contact_name) LIKE ? OR lower(l.business_email) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const rows = await all(
    `SELECT l.id, l.business_name, l.owner_contact_name, l.business_email, l.phone, l.category, l.listing_type,
            l.status, l.admin_note, l.last_updated, l.created_at, l.short_summary, l.full_description,
            l.supports_bvi, l.accessibility_details, l.city, l.state, l.website_url,
            l.is_featured, l.featured_rank,
            COALESCE(ROUND((
              SELECT AVG(r.rating) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 1), NULL) AS average_rating,
            COALESCE((
              SELECT COUNT(*) FROM reviews r
              WHERE r.listing_id = l.id AND r.status='approved'
            ), 0) AS review_count,
            u.full_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone, u.status AS owner_status
     FROM listings l
     LEFT JOIN users u ON u.id = l.owner_user_id
     ${where}
     ORDER BY CASE WHEN l.status='pending' THEN 0 ELSE 1 END, datetime(l.created_at) DESC
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

  await logAdminAction({
    adminUserId: req.user.sub,
    action: `listing_status_${String(status)}`,
    targetType: "listing",
    targetId: id,
    meta: { adminNote: adminNote ? String(adminNote).trim() : null }
  });

  const to = listing.owner_email || listing.business_email;
  const business = listing.business_name;
  const notePart = adminNote ? `\n\nAdmin note:\n${adminNote}` : "";
  let subject = `ETIB listing update: ${business}`;
  let text = `Your listing \"${business}\" status is now: ${status}.`;

  if (status === "approved") {
    subject = `Your ETIB listing was approved: ${business}`;
    text =
`Great news.

Your ETIB Community Connect Directory listing \"${business}\" has been approved and is now live.

You can now be discovered through the directory by community members looking for trusted businesses and services.

${notePart ? notePart.trim() : ""}

Thank you for being part of the ETIB Community Connect Directory.

ETIB
Even Though I'm Blind`;
  } else if (status === "needs_changes") {
    subject = `Changes needed for your ETIB listing: ${business}`;
    text =
`Your ETIB listing \"${business}\" needs changes before approval.${notePart}

Please review the note above and update your information accordingly.

ETIB
Even Though I'm Blind`;
  } else if (status === "rejected") {
    subject = `Update on your ETIB listing: ${business}`;
    text =
`Your ETIB listing \"${business}\" was not approved at this time.${notePart}

You may contact ETIB if you have questions about the decision.

ETIB
Even Though I'm Blind`;
  }

  let emailSent = false;
  try {
    emailSent = await sendMail({ to, subject, text });
  } catch {
    emailSent = false;
  }

  await logAdminAction({
    adminUserId: req.user.sub,
    action: emailSent ? "listing_notification_sent" : "listing_notification_failed",
    targetType: "listing",
    targetId: id,
    meta: { status, to }
  });

  return res.json({ ok: true, emailSent });
});

app.patch("/api/admin/listings/:id/feature", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const { isFeatured, featuredRank } = req.body || {};

  const listing = await get(
    `SELECT id, business_name, status, is_featured, featured_rank
     FROM listings
     WHERE id=?`,
    [id]
  );

  if (!listing) return res.status(404).json({ error: "Listing not found" });
  if (listing.status !== "approved") {
    return res.status(400).json({ error: "Only approved listings can be featured" });
  }

  const wantFeatured = Number(isFeatured) === 1;

  if (!wantFeatured) {
    await run(
      `UPDATE listings
       SET is_featured=0,
           featured_rank=NULL,
           last_updated=datetime('now')
       WHERE id=?`,
      [id]
    );

    await logAdminAction({
      adminUserId: req.user.sub,
      action: "listing_feature_removed",
      targetType: "listing",
      targetId: id,
      meta: { businessName: listing.business_name }
    });

    return res.json({ ok: true });
  }

  const rank = Number(featuredRank);
  if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
    return res.status(400).json({ error: "featuredRank must be 1 through 5" });
  }

  await run("BEGIN TRANSACTION");
  try {
    await run(
      `UPDATE listings
       SET is_featured=0,
           featured_rank=NULL,
           last_updated=datetime('now')
       WHERE featured_rank=? AND is_featured=1 AND id<>?`,
      [rank, id]
    );

    await run(
      `UPDATE listings
       SET is_featured=1,
           featured_rank=?,
           last_updated=datetime('now')
       WHERE id=?`,
      [rank, id]
    );

    await run("COMMIT");
  } catch {
    await run("ROLLBACK").catch(() => {});
    return res.status(500).json({ error: "Could not update featured placement" });
  }

  await logAdminAction({
    adminUserId: req.user.sub,
    action: "listing_feature_set",
    targetType: "listing",
    targetId: id,
    meta: { businessName: listing.business_name, featuredRank: rank }
  });

  return res.json({ ok: true });
});

app.get("/api/admin/users", authRequired, adminRequired, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();
  const includeHidden = String(req.query.includeHidden || "").trim() === "1";

  let where = "WHERE 1=1";
  const params = [];

  if (!includeHidden) {
    where += " AND COALESCE(u.is_hidden, 0)=0";
  }

  if (status) {
    where += " AND u.status=?";
    params.push(status);
  }

  if (q) {
    where += " AND (lower(u.full_name) LIKE ? OR lower(u.email) LIKE ? OR lower(u.phone) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const rows = await all(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.created_at, u.approved_at,
            COALESCE(u.is_hidden, 0) AS is_hidden,
            approver.full_name AS approved_by_name,
            COALESCE((SELECT COUNT(*) FROM listings l WHERE l.owner_user_id = u.id), 0) AS listing_count,
            COALESCE((SELECT COUNT(*) FROM listings l WHERE l.owner_user_id = u.id AND l.status='pending'), 0) AS pending_listing_count,
            COALESCE((SELECT COUNT(*) FROM listings l WHERE l.owner_user_id = u.id AND l.status='approved'), 0) AS approved_listing_count
     FROM users u
     LEFT JOIN users approver ON approver.id = u.approved_by_user_id
     ${where}
     ORDER BY CASE WHEN u.status='pending' THEN 0 WHEN u.status='approved' THEN 1 ELSE 2 END,
              datetime(u.created_at) DESC
     LIMIT 1000`,
    params
  );

  const summary = await get(
    `SELECT
       COALESCE(SUM(CASE WHEN status='pending' AND COALESCE(is_hidden,0)=0 THEN 1 ELSE 0 END), 0) AS pending_users,
       COALESCE(SUM(CASE WHEN status='approved' AND COALESCE(is_hidden,0)=0 THEN 1 ELSE 0 END), 0) AS approved_users,
       COALESCE(SUM(CASE WHEN status='rejected' AND COALESCE(is_hidden,0)=0 THEN 1 ELSE 0 END), 0) AS rejected_users,
       COALESCE(SUM(CASE WHEN COALESCE(is_hidden,0)=1 THEN 1 ELSE 0 END), 0) AS hidden_users
     FROM users`
  );

  res.json({ users: rows, summary });
});

app.patch("/api/admin/users/:id/status", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const { status, hideAfterReject } = req.body || {};
  const valid = ["pending", "approved", "rejected"];
  if (!valid.includes(String(status))) {
    return res.status(400).json({ error: "Invalid user status" });
  }

  const user = await get(
    "SELECT id, full_name, email, role, status, COALESCE(is_hidden, 0) AS is_hidden FROM users WHERE id=?",
    [id]
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") return res.status(400).json({ error: "Admin users cannot be moderated here" });

  const hideUser = String(status) === "rejected" && Number(hideAfterReject) === 1 ? 1 : 0;

  await run(
    `UPDATE users
     SET status=?,
         approved_at=CASE WHEN ?='approved' THEN datetime('now') ELSE approved_at END,
         approved_by_user_id=CASE WHEN ?='approved' THEN ? ELSE approved_by_user_id END,
         is_hidden=CASE WHEN ?='rejected' THEN ? ELSE COALESCE(is_hidden, 0) END
     WHERE id=?`,
    [String(status), String(status), String(status), req.user.sub, String(status), hideUser, id]
  );

  let emailSent = false;
  if (String(status) === "approved") {
    emailSent = await sendMail({
      to: user.email,
      subject: "Your ETIB account has been approved",
      text:
`Hello ${user.full_name},

Your ETIB Community Connect account has been approved.

You can sign in and continue submitting and managing your business information.

ETIB
Even Though I'm Blind`
    });
  }

  await logAdminAction({
    adminUserId: req.user.sub,
    action: `user_status_${String(status)}`,
    targetType: "user",
    targetId: id,
    meta: { email: user.email, emailSent, hideUser }
  });

  res.json({ ok: true, emailSent, hidden: hideUser === 1 });
});

app.get("/api/admin/reviews", authRequired, adminRequired, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim().toLowerCase();

  let where = "WHERE 1=1";
  const params = [];

  if (status) {
    where += " AND r.status=?";
    params.push(status);
  }

  if (q) {
    where += " AND (lower(l.business_name) LIKE ? OR lower(r.reviewer_name) LIKE ? OR lower(r.review_text) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const rows = await all(
    `SELECT r.id, r.listing_id, r.reviewer_name, r.reviewer_email, r.rating, r.review_text,
            r.status, r.admin_note, r.created_at, r.approved_at,
            l.business_name
     FROM reviews r
     LEFT JOIN listings l ON l.id = r.listing_id
     ${where}
     ORDER BY datetime(r.created_at) DESC
     LIMIT 300`,
    params
  );

  res.json({ reviews: rows });
});

app.patch("/api/admin/reviews/:id", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid review id" });
  }

  const { status, adminNote } = req.body || {};
  const valid = ["pending", "approved", "rejected"];
  if (!valid.includes(String(status))) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const review = await get(
    `SELECT r.id, r.reviewer_email, r.reviewer_name, r.rating, r.review_text, r.listing_id,
            l.business_name
     FROM reviews r
     LEFT JOIN listings l ON l.id=r.listing_id
     WHERE r.id=?`,
    [id]
  );

  if (!review) return res.status(404).json({ error: "Review not found" });

  await run(
    `UPDATE reviews
     SET status=?,
         admin_note=?,
         moderated_by_user_id=?,
         approved_at=CASE WHEN ?='approved' THEN datetime('now') ELSE approved_at END
     WHERE id=?`,
    [
      String(status),
      adminNote ? String(adminNote).trim() : null,
      req.user.sub,
      String(status),
      id
    ]
  );

  await logAdminAction({
    adminUserId: req.user.sub,
    action: `review_status_${String(status)}`,
    targetType: "review",
    targetId: id,
    meta: { adminNote: adminNote ? String(adminNote).trim() : null }
  });

  const to = review.reviewer_email;
  if (to) {
    let subject = "Your ETIB review update";
    let text = `Your review for \"${review.business_name}\" is now: ${status}.`;
    if (adminNote) text += `\n\nAdmin note:\n${adminNote}`;
    await sendMail({ to, subject, text });
  }

  res.json({ ok: true });
});

app.get("/api/admin/reports", authRequired, adminRequired, async (req, res) => {
  const rows = await all(
    `SELECT r.id, r.listing_id, r.reporter_email, r.reason, r.created_at, l.business_name
     FROM reports r
     LEFT JOIN listings l ON l.id=r.listing_id
     ORDER BY datetime(r.created_at) DESC
     LIMIT 200`
  );
  res.json({ reports: rows });
});

app.get("/api/admin/audit-logs", authRequired, adminRequired, async (req, res) => {
  const rows = await all(
    `SELECT a.id, a.admin_user_id, a.action, a.target_type, a.target_id, a.meta_json, a.created_at,
            u.full_name AS admin_name, u.email AS admin_email
     FROM admin_audit_logs a
     LEFT JOIN users u ON u.id = a.admin_user_id
     ORDER BY datetime(a.created_at) DESC
     LIMIT 500`
  );
  res.json({ logs: rows });
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
