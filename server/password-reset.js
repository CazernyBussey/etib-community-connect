import crypto from "crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

const APP_BASE_URL = (process.env.APP_BASE_URL || "").trim();
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 60);

function buildAppUrl(req, relativePath) {
  const configured = APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return new URL(relativePath, configured.endsWith("/") ? configured : `${configured}/`).toString();
}

function makeResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function passwordResetExpirySql() {
  return `datetime('now', '+${RESET_TOKEN_TTL_MINUTES} minutes')`;
}

export async function applyPasswordResetMigrations(run) {
  await run("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT").catch(() => {});
  await run("ALTER TABLE users ADD COLUMN password_reset_requested_at TEXT").catch(() => {});
  await run("CREATE INDEX IF NOT EXISTS idx_users_reset_hash ON users(password_reset_token_hash)").catch(() => {});
}

export function registerPasswordResetRoutes(app, deps) {
  const { get, run, sendMail, ensureAdminRole, validEmail } = deps;

  const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many password reset requests. Please try again later." }
  });

  app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const emailNorm = String(req.body?.email || "").toLowerCase().trim();
      if (!validEmail(emailNorm)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      await ensureAdminRole(emailNorm);
      const user = await get(
        "SELECT id, full_name, email, is_hidden FROM users WHERE lower(email)=lower(?)",
        [emailNorm]
      );

      const genericResponse = {
        ok: true,
        message: "If that email exists in our system, a password reset link has been sent."
      };

      if (!user || Number(user.is_hidden) === 1) {
        return res.json(genericResponse);
      }

      const token = makeResetToken();
      const tokenHash = hashResetToken(token);
      await run(
        `UPDATE users
         SET password_reset_token_hash=?,
             password_reset_expires_at=${passwordResetExpirySql()},
             password_reset_requested_at=datetime('now')
         WHERE id=?`,
        [tokenHash, user.id]
      );

      const resetLink = buildAppUrl(req, `reset-password.html?token=${encodeURIComponent(token)}`);
      const emailSent = await sendMail({
        to: user.email,
        subject: "Reset your ETIB password",
        text:
`Hello ${user.full_name || "there"},

We received a request to reset your ETIB Community Connect password.

Use this secure link to choose a new password:
${resetLink}

This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.

If you did not request a reset, you can ignore this email.

ETIB
Even Though I'm Blind`
      });

      return res.json({ ...genericResponse, emailSent });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/reset-password", forgotPasswordLimiter, async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      if (!token) return res.status(400).json({ error: "Missing reset token" });
      if (password.length < 10) {
        return res.status(400).json({ error: "Password must be at least 10 characters" });
      }

      const tokenHash = hashResetToken(token);
      const user = await get(
        `SELECT id
         FROM users
         WHERE password_reset_token_hash=?
           AND password_reset_expires_at IS NOT NULL
           AND datetime(password_reset_expires_at) >= datetime('now')
         LIMIT 1`,
        [tokenHash]
      );

      if (!user) {
        return res.status(400).json({ error: "This reset link is invalid or has expired." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await run(
        `UPDATE users
         SET password_hash=?,
             password_reset_token_hash=NULL,
             password_reset_expires_at=NULL,
             password_reset_requested_at=NULL
         WHERE id=?`,
        [passwordHash, user.id]
      );

      return res.json({ ok: true, message: "Your password has been updated. You can sign in now." });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  });
}
