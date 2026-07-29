import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(serverDir, "..", "..", "public");
const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html")).sort();

test("every page has the core keyboard and screen-reader structure", () => {
  assert.ok(htmlFiles.length >= 10);

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8");
    assert.match(html, /<html\s+lang="en"/i, `${file} needs a language`);
    assert.match(html, /class="[^"]*skip-link[^"]*"/i, `${file} needs a skip link`);
    assert.match(html, /<main\b[^>]*\bid="[^"]+"/i, `${file} needs an identified main landmark`);
    assert.match(html, /<nav\b[^>]*\baria-label="[^"]+"/i, `${file} needs a named navigation landmark`);
    assert.match(html, /<title>[^<]+<\/title>/i, `${file} needs a page title`);

    const h1Count = (html.match(/<h1\b/gi) || []).length;
    assert.equal(h1Count, 1, `${file} must have exactly one h1`);

    let previousHeading = 0;
    for (const heading of html.matchAll(/<h([1-6])\b/gi)) {
      const level = Number(heading[1]);
      assert.ok(!previousHeading || level <= previousHeading + 1, `${file} skips a heading level`);
      previousHeading = level;
    }

    const ids = [...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} has duplicate IDs`);

    for (const image of html.match(/<img\b[^>]*>/gi) || []) {
      assert.match(image, /\balt="[^"]*"/i, `${file} has an image without alt text`);
      assert.match(image, /\bwidth="\d+"/i, `${file} image needs intrinsic width`);
      assert.match(image, /\bheight="\d+"/i, `${file} image needs intrinsic height`);
    }

    for (const control of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const markup = control[0];
      if (/type="(?:hidden|submit|button)"/i.test(markup)) continue;
      const id = markup.match(/\bid="([^"]+)"/i)?.[1];
      assert.ok(id, `${file} has a form control without an ID`);
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(html, new RegExp(`<label\\b[^>]*for="${escapedId}"`, "i"), `${file} needs a label for ${id}`);
    }

    for (const reference of html.matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
      const raw = reference[1];
      if (/^(?:https?:|mailto:|tel:|sms:|#)/i.test(raw)) continue;
      const localPath = raw.split(/[?#]/)[0];
      if (!localPath) continue;
      assert.ok(fs.existsSync(path.resolve(publicDir, localPath)), `${file} references missing file ${raw}`);
    }
  }
});

test("interactive pages expose status messages and avoid obsolete interaction patterns", () => {
  const combined = htmlFiles
    .map((file) => fs.readFileSync(path.join(publicDir, file), "utf8"))
    .join("\n");
  const script = fs.readFileSync(path.join(publicDir, "script.js"), "utf8");

  assert.doesNotMatch(combined, /auth-accessibility\.js|edit-business\.js/);
  assert.doesNotMatch(combined, /target="_blank"/i);
  assert.doesNotMatch(script, /\b(?:alert|prompt|confirm)\s*\(/);
  assert.match(script, /function escapeHtml\(/);
  assert.match(script, /function safeWebsiteUrl\(/);

  for (const file of ["login.html", "signup.html", "forgot-password.html", "reset-password.html", "add-business.html", "business-profile.html", "owner-dashboard.html", "admin-dashboard.html"]) {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8");
    assert.match(html, /\b(?:role="status"|aria-live="(?:polite|assertive)")/i, `${file} needs a live status region`);
  }
});

test("styles include strong focus, contrast-mode, motion, and target-size support", () => {
  const css = fs.readFileSync(path.join(publicDir, "styles.css"), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(css, /--tap:\s*44px/);
});
