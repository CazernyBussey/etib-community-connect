import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

test("public, owner, recovery, review, and admin flows work end to end", async (context) => {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "etib-e2e-"));
  const logs = [];
  const sharedEnvironment = {
    ...process.env,
    DB_PATH: path.join(tempDir, "etib.db"),
    NODE_ENV: "test",
    JWT_SECRET: "test-only-secret-that-is-longer-than-thirty-two-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PHONE: "202-555-0120",
    PUBLIC_BASE_URL: `${baseUrl}/`,
    AUTH_RATE_MAX: "50",
    TEST_EXPOSE_RESET_TOKEN: "1"
  };
  const adminSetup = spawnSync(process.execPath, ["create-admin.js"], {
    cwd: serverDir,
    env: sharedEnvironment,
    encoding: "utf8"
  });
  assert.equal(adminSetup.status, 0, adminSetup.stderr);
  const adminPassword = adminSetup.stdout.match(/Temporary password: (.+)/)?.[1]?.trim();
  assert.ok(adminPassword, "Admin bootstrap must return a temporary password");

  const child = spawn(process.execPath, ["server.js"], {
    cwd: serverDir,
    env: { ...sharedEnvironment, PORT: String(port) },
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child).catch((error) => {
    throw new Error(`${error.message}\n${logs.join("")}`);
  });

  async function request(route, { method = "GET", token, body } = {}) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    return { response, data };
  }

  let result = await request("/api/health");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");

  result = await request("/api/auth/signup", {
    method: "POST",
    body: {
      fullName: "Directory Owner",
      email: "owner@example.com",
      phone: "202-555-0100",
      password: "OwnerPass!234"
    }
  });
  assert.equal(result.response.status, 201);
  const ownerId = result.data.user.id;
  const ownerToken = result.data.token;
  assert.equal(result.data.user.status, "pending");

  result = await request("/api/auth/me", { token: ownerToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.user.email, "owner@example.com");

  const listing = {
    businessName: "Accessible Path Consulting",
    ownerContactName: "Directory Owner",
    businessEmail: "hello@accessiblepath.example",
    phone: "202-555-0110",
    textNumber: "202-555-0111",
    websiteUrl: "https://accessiblepath.example/services",
    listingType: "Both",
    category: "Accessibility Consulting",
    shortSummary: "Practical accessibility consulting for inclusive organizations.",
    fullDescription: "We help organizations make websites, documents, events, and customer service more accessible.",
    listenSummary: "Accessible Path provides practical accessibility consulting.",
    supportsBvi: "Our work is led with direct blind-community input and paid expertise.",
    accessibilityDetails: "Screen-reader friendly communication, accessible documents, and phone support are available.",
    primaryContactMethod: "Website",
    city: "Washington",
    state: "DC",
    serviceAreaType: "Nationwide",
    hours: "Monday through Friday, 9 AM to 5 PM Eastern",
    languages: "English",
    remoteDetails: "Services are available by accessible video call or telephone.",
    inpersonNotes: "Step-free meeting locations are arranged on request.",
    socialLinks: "",
    certifications: "",
    testimonial: ""
  };

  result = await request("/api/listings", { method: "POST", token: ownerToken, body: listing });
  assert.equal(result.response.status, 201);
  const listingId = result.data.id;

  result = await request("/api/owner/listings", { token: ownerToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.owner.email, "owner@example.com");
  assert.equal(result.data.listings[0].status, "pending");

  result = await request("/api/listings?q=Accessible");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 0);

  result = await request("/api/auth/signup", {
    method: "POST",
    body: {
      fullName: "Admin Email Takeover Attempt",
      email: "admin@example.com",
      phone: "202-555-0120",
      password: "AttackerPass!234"
    }
  });
  assert.equal(result.response.status, 409);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@example.com", password: adminPassword }
  });
  assert.equal(result.response.status, 200);
  const adminToken = result.data.token;
  assert.equal(result.data.user.role, "admin");
  assert.equal(result.data.user.status, "approved");

  result = await request(`/api/admin/listings/${listingId}`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "approved", adminNote: "Verified for publication." }
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/admin/listings/${listingId}/feature`, {
    method: "PATCH",
    token: adminToken,
    body: { isFeatured: 1, featuredRank: 1 }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/listings?q=accessibility&page=999");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 1);
  assert.equal(result.data.pagination.page, 1);
  assert.equal(result.data.listings[0].business_name, listing.businessName);

  result = await request("/api/featured-listings");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.listings[0].id, listingId);

  result = await request(`/api/listings/${listingId}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.listing.website_url, listing.websiteUrl);

  result = await request(`/api/listings/${listingId}/reviews`, {
    method: "POST",
    body: {
      reviewerName: "Community Member",
      reviewerEmail: "member@example.com",
      rating: 5,
      reviewText: "The team communicated clearly and made every document easy to use."
    }
  });
  assert.equal(result.response.status, 201);
  const reviewId = result.data.reviewId;

  result = await request(`/api/admin/reviews/${reviewId}`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "approved", adminNote: "Meets review guidelines." }
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/listings/${listingId}/reviews`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.summary.reviewCount, 1);
  assert.equal(result.data.reviews[0].rating, 5);

  result = await request(`/api/owner/listings/${listingId}`, {
    method: "PUT",
    token: ownerToken,
    body: { ...listing, hours: "Monday through Thursday, 9 AM to 5 PM Eastern" }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.status, "pending");

  result = await request("/api/featured-listings");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.listings.length, 0);

  result = await request("/api/auth/forgot-password", {
    method: "POST",
    body: { email: "owner@example.com" }
  });
  assert.equal(result.response.status, 200);
  assert.match(result.data.testToken, /^[a-f0-9]{64}$/);

  result = await request("/api/auth/reset-password", {
    method: "POST",
    body: { token: result.data.testToken, password: "NewOwnerPass!567" }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.com", password: "NewOwnerPass!567" }
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/admin/listings/${listingId}`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "approved", adminNote: "Approved after owner update." }
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/admin/listings/${listingId}/feature`, {
    method: "PATCH",
    token: adminToken,
    body: { isFeatured: 1, featuredRank: 1 }
  });
  assert.equal(result.response.status, 200);

  result = await request(`/api/admin/users/${ownerId}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "rejected", hideAfterReject: 1 }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.hidden, true);

  result = await request("/api/auth/me", { token: ownerToken });
  assert.equal(result.response.status, 403);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.com", password: "NewOwnerPass!567" }
  });
  assert.equal(result.response.status, 401);

  result = await request("/api/listings?q=Accessible");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 0);

  result = await request("/api/featured-listings");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.listings.length, 0);

  result = await request("/api/admin/users?includeHidden=1", { token: adminToken });
  assert.equal(result.response.status, 200);
  const hiddenOwner = result.data.users.find((user) => user.id === ownerId);
  assert.equal(hiddenOwner.is_hidden, 1);

  result = await request(`/api/admin/users/${ownerId}/status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "approved", hideAfterReject: 0 }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.hidden, false);

  result = await request("/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.com", password: "NewOwnerPass!567" }
  });
  assert.equal(result.response.status, 200);

  result = await request("/api/listings?q=Accessible");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.pagination.total, 0);

  const missingPage = await fetch(`${baseUrl}/does-not-exist`, { headers: { Accept: "text/html" } });
  assert.equal(missingPage.status, 404);
  assert.match(await missingPage.text(), /Page not found/);

  result = await request("/api/does-not-exist");
  assert.equal(result.response.status, 404);
  assert.equal(result.data.error, "API route not found");
  assert.doesNotMatch(logs.join(""), /Unhandled request error|ValidationError|Error:/);
});
