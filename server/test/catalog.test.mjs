import assert from "node:assert/strict";
import test from "node:test";
import {
  activeBusinesses,
  findBusiness,
  getDirectoryOptions,
  loadCatalog,
  searchBusinesses,
  validateCatalog
} from "../directory-data.js";

test("the committed business catalog is valid and searchable", () => {
  const catalog = loadCatalog();
  const businesses = activeBusinesses(catalog);
  assert.equal(businesses.length, 1);
  assert.equal(businesses[0].id, "etib-inc");
  assert.equal(findBusiness(catalog, "etib-inc").id, "etib-inc");
  assert.equal(findBusiness(catalog, "1").id, "etib-inc");
  assert.equal(findBusiness(catalog, "999"), null);

  assert.equal(searchBusinesses(catalog, { query: "podcasting" }).length, 1);
  assert.equal(searchBusinesses(catalog, { category: "Nonprofit and Community Support" }).length, 1);
  assert.equal(searchBusinesses(catalog, { location: "new york" }).length, 1);
  assert.equal(searchBusinesses(catalog, { contactMethod: "email" }).length, 1);
  assert.equal(searchBusinesses(catalog, { contactMethod: "text" }).length, 0);

  const options = getDirectoryOptions(catalog);
  assert.equal(options.businessCount, 1);
  assert.deepEqual(options.categories, ["Nonprofit and Community Support"]);
});

test("inactive businesses are never returned publicly", () => {
  const catalog = structuredClone(loadCatalog());
  catalog.businesses[0].status = "inactive";
  catalog.businesses[0].featured = { enabled: false, rank: null };
  validateCatalog(catalog);
  assert.equal(activeBusinesses(catalog).length, 0);
  assert.equal(searchBusinesses(catalog).length, 0);
  assert.equal(findBusiness(catalog, "etib-inc"), null);
});

test("validation rejects unsafe or conflicting catalog changes", () => {
  const badUrl = structuredClone(loadCatalog());
  badUrl.businesses[0].contact.website = "javascript:alert(1)";
  assert.throws(() => validateCatalog(badUrl), /must use http or https/);

  const duplicate = structuredClone(loadCatalog());
  const second = structuredClone(duplicate.businesses[0]);
  second.name = "Duplicate";
  duplicate.businesses.push(second);
  assert.throws(() => validateCatalog(duplicate), /id must be unique/);

  const incomplete = structuredClone(loadCatalog());
  incomplete.businesses[0].accessibility = "";
  assert.throws(() => validateCatalog(incomplete), /accessibility must be a non-empty string/);
});
