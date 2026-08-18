// Deployment marker: directory tabs release 2026-08-17
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeBusinesses,
  findBusiness,
  getDirectoryOptions,
  loadCatalog,
  searchBusinesses,
  summarizeBusiness
} from "./directory-data.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(serverDir, "..", "public");
const catalog = loadCatalog();
const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }
  res.set("Allow", "GET, HEAD").status(405).json({
    error: "This directory is read-only. ETIB manages verified businesses through the code-managed catalog."
  });
});

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: "read-only",
    businessCount: activeBusinesses(catalog).length,
    catalogUpdated: catalog.catalogUpdated
  });
});

app.get("/api/directory-options", (req, res) => {
  res.json(getDirectoryOptions(catalog));
});

app.get("/api/featured-listings", (req, res) => {
  const listings = searchBusinesses(catalog)
    .filter((business) => business.featured.enabled)
    .map(summarizeBusiness);
  res.json({ listings });
});

app.get("/api/listings", (req, res) => {
  const pageSize = positiveInteger(req.query.pageSize, 24, 100);
  const requestedPage = positiveInteger(req.query.page, 1, 100000);
  const filtered = searchBusinesses(catalog, {
    query: req.query.q,
    category: req.query.category,
    listingType: req.query.listingType,
    location: req.query.location,
    contactMethod: req.query.contactMethod,
    group: req.query.group
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const listings = filtered.slice(start, start + pageSize).map(summarizeBusiness);
  res.json({
    listings,
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages
    }
  });
});

app.get("/api/listings/:identifier", (req, res) => {
  const business = findBusiness(catalog, req.params.identifier);
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  res.json({ business });
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  index: "index.html",
  maxAge: "1h",
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.set("Cache-Control", "no-cache");
    } else if (/\.(?:css|js|webp|png)$/.test(filePath)) {
      res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    }
  }
}));

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((req, res) => {
  if (req.accepts("html")) {
    res.status(404).sendFile(path.join(publicDir, "404.html"));
    return;
  }
  res.status(404).end();
});

const port = positiveInteger(process.env.PORT, 8080, 65535);
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const server = app.listen(port, () => {
    console.log(`ETIB Community Connect listening on port ${port} in read-only mode`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export default app;
