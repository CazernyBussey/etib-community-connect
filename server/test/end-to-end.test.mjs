import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
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

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for test server");
}

test("the code-managed directory works end to end and blocks public writes", async (context) => {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  context.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 1500);
      });
    }
  });

  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${logs.join("")}`);
  });

  async function request(route, { method = "GET", body, accept = "application/json" } = {}) {
    const headers = { Accept: accept };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    return { response, data, text };
  }

  let result = await request("/api/health");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, {
    ok: true,
    mode: "read-only",
    businessCount: 1,
    catalogUpdated: "2026-07-30"
  });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.response.headers.get("content-security-policy"), /default-src 'self'/);

  result = await request("/api/directory-options");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.businessCount, 1);
  assert.deepEqual(result.data.categories, ["Nonprofit and Community Support"]);
  assert.ok(result.data.contactMethods.some((item) => item.value === "email"));

  result = await request("/api/listings");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 1);
  assert.equal(result.data.listings[0].id, "etib-inc");
  assert.equal(result.data.listings[0].featured.enabled, true);

  for (const route of [
    "/api/listings?q=accessible",
    "/api/listings?category=Nonprofit%20and%20Community%20Support",
    "/api/listings?listingType=Blind-Owned%20%2F%20Visually%20Impaired-Owned",
    "/api/listings?location=Manhattan",
    "/api/listings?contactMethod=email"
  ]) {
    result = await request(route);
    assert.equal(result.response.status, 200, route);
    assert.equal(result.data.pagination.total, 1, route);
  }

  result = await request("/api/listings?contactMethod=text");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 0);

  result = await request("/api/listings?q=not-a-real-business&page=999");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 0);
  assert.equal(result.data.pagination.page, 1);

  result = await request("/api/featured-listings");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.listings[0].id, "etib-inc");

  const stable = await request("/api/listings/etib-inc");
  const legacy = await request("/api/listings/1");
  assert.equal(stable.response.status, 200);
  assert.equal(legacy.response.status, 200);
  assert.equal(stable.data.business.id, legacy.data.business.id);
  assert.equal(stable.data.business.contact.email, "etib@eventhoughimblind.com");

  for (const [method, route] of [
    ["POST", "/api/listings"],
    ["POST", "/api/auth/signup"],
    ["POST", "/api/listings/etib-inc/reviews"],
    ["PUT", "/api/listings/etib-inc"],
    ["PATCH", "/api/admin/listings/etib-inc"],
    ["DELETE", "/api/listings/etib-inc"]
  ]) {
    result = await request(route, { method, body: {} });
    assert.equal(result.response.status, 405, `${method} ${route}`);
    assert.equal(result.response.headers.get("allow"), "GET, HEAD");
    assert.match(result.data.error, /read-only/i);
  }

  for (const page of [
    "/add-business.html",
    "/signup.html",
    "/login.html",
    "/owner-dashboard.html",
    "/admin-dashboard.html",
    "/forgot-password.html"
  ]) {
    result = await request(page, { accept: "text/html" });
    assert.equal(result.response.status, 404, page);
    assert.match(result.text, /Page not found/i);
  }

  result = await request("/index.html", { accept: "text/html" });
  assert.equal(result.response.status, 200);
  assert.match(result.text, /Search businesses/);
  assert.doesNotMatch(result.text, /Add Business|Sign Up|Sign In|Dashboard/);

  result = await request("/api/does-not-exist");
  assert.equal(result.response.status, 404);
  assert.equal(result.data.error, "API route not found");

  result = await request("/does-not-exist", { accept: "text/html" });
  assert.equal(result.response.status, 404);
  assert.match(result.text, /Page not found/i);

  assert.doesNotMatch(logs.join(""), /Unhandled|ValidationError|Error:/);
});
