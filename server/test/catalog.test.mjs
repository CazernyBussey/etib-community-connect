import assert from "node:assert/strict";
import test from "node:test";
import {
  activeBusinesses,
  findBusiness,
  getDirectoryOptions,
  loadCatalog,
  searchBusinesses,
  summarizeBusiness,
  validateCatalog
} from "../directory-data.js";

test("the committed business catalog is valid and searchable", () => {
  const catalog = loadCatalog();
  const businesses = activeBusinesses(catalog);
  assert.ok(businesses.length > 0);
  assert.equal(findBusiness(catalog, "etib-inc").id, "etib-inc");
  assert.equal(findBusiness(catalog, "1").id, "etib-inc");
  assert.equal(findBusiness(catalog, "999"), null);
  const options = getDirectoryOptions(catalog);
  assert.equal(options.businessCount, businesses.length);
  assert.ok(options.categories.includes("Nonprofit and Community Support"));

});

test("inactive businesses are never returned publicly", () => {
  const catalog = structuredClone(loadCatalog());
  catalog.businesses = [structuredClone(findBusiness(catalog, "etib-inc"))];
  catalog.businesses[0].status = "inactive";
  catalog.businesses[0].featured = { enabled: false, rank: null };
  summarizeBusiness,
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

test("ETIB organization is in businesses while its podcast and Blind Table Talk are in media", () => {
  const catalog = loadCatalog();
  const businessIds = searchBusinesses(catalog, { group: "business" }).map(b => b.id);
  const mediaIds = searchBusinesses(catalog, { group: "media" }).map(b => b.id);
  assert.ok(businessIds.includes("etib-inc"));
  assert.ok(!mediaIds.includes("etib-inc"));
  for (const id of ["even-though-im-blind-experience-podcast", "blind-table-talk"]) {
    assert.ok(mediaIds.includes(id));
    assert.ok(!businessIds.includes(id));
  }
});

test("audio descriptions are withheld when their text no longer matches the listing", () => {
  const business = structuredClone(findBusiness(loadCatalog(), "etib-inc"));
  assert.equal(summarizeBusiness(business).description, business.description);
  assert.ok(summarizeBusiness(business).descriptionAudio);
  business.description += " Updated information.";
  assert.equal(summarizeBusiness(business).descriptionAudio, null);
});
