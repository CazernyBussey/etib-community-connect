import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const defaultCatalogPath = path.join(serverDir, "data", "businesses.json");

export const listingTypes = [
  "Blind-Owned / Visually Impaired-Owned",
  "Community Service Provider",
  "Both"
];

// Keep simple directory categories available for future listings even before
// the first listing in that category is added to the catalog.
export const supportedCategories = [
  "Podcast"
];

const preferredMethods = ["Phone", "Text", "Email", "Website"];
const businessStatuses = ["active", "inactive"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateWebUrl(value, field, errors) {
  if (value === null) return;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} must be a non-empty web URL or null.`);
    return;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${field} must use http or https.`);
    }
  } catch {
    errors.push(`${field} must be a valid web URL.`);
  }
}

function requiredString(value, field, errors) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} must be a non-empty string.`);
  }
}

function optionalString(value, field, errors) {
  if (value !== null && (typeof value !== "string" || !value.trim())) {
    errors.push(`${field} must be a non-empty string or null.`);
  }
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function stringArray(value, field, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings.`);
    return;
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim()) {
      errors.push(`${field}[${index}] must be a non-empty string.`);
      continue;
    }
    const key = item.trim().toLowerCase();
    if (seen.has(key)) errors.push(`${field} contains duplicate value "${item}".`);
    seen.add(key);
  }
}

function validateBusiness(business, index, errors, ids, legacyIds, featuredRanks) {
  const field = `businesses[${index}]`;
  if (!isPlainObject(business)) {
    errors.push(`${field} must be an object.`);
    return;
  }

  requiredString(business.id, `${field}.id`, errors);
  if (typeof business.id === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(business.id)) {
    errors.push(`${field}.id must use lowercase letters, numbers, and single hyphens.`);
  }
  if (ids.has(business.id)) errors.push(`${field}.id must be unique.`);
  ids.add(business.id);

  if (!Array.isArray(business.legacyIds)) {
    errors.push(`${field}.legacyIds must be an array.`);
  } else {
    for (const [legacyIndex, legacyId] of business.legacyIds.entries()) {
      if (!Number.isInteger(legacyId) || legacyId < 1) {
        errors.push(`${field}.legacyIds[${legacyIndex}] must be a positive integer.`);
      } else if (legacyIds.has(legacyId)) {
        errors.push(`${field}.legacyIds contains an ID already assigned to another business.`);
      } else {
        legacyIds.add(legacyId);
      }
    }
  }

  requiredString(business.name, `${field}.name`, errors);
  if (!businessStatuses.includes(business.status)) {
    errors.push(`${field}.status must be active or inactive.`);
  }
  if (!listingTypes.includes(business.listingType)) {
    errors.push(`${field}.listingType must be one of the supported listing types.`);
  }

  if (!isPlainObject(business.featured)) {
    errors.push(`${field}.featured must be an object.`);
  } else {
    if (typeof business.featured.enabled !== "boolean") {
      errors.push(`${field}.featured.enabled must be true or false.`);
    }
    if (business.featured.enabled) {
      if (!Number.isInteger(business.featured.rank) || business.featured.rank < 1) {
        errors.push(`${field}.featured.rank must be a positive integer when featured.`);
      } else if (featuredRanks.has(business.featured.rank)) {
        errors.push(`${field}.featured.rank must be unique among featured businesses.`);
      } else {
        featuredRanks.add(business.featured.rank);
      }
      if (business.status !== "active") {
        errors.push(`${field} cannot be featured while inactive.`);
      }
    } else if (business.featured.rank !== null) {
      errors.push(`${field}.featured.rank must be null when featured.enabled is false.`);
    }
  }

  stringArray(business.categories, `${field}.categories`, errors, { allowEmpty: false });
  stringArray(business.services, `${field}.services`, errors, { allowEmpty: false });
  requiredString(business.summary, `${field}.summary`, errors);
  requiredString(business.description, `${field}.description`, errors);
  requiredString(business.spokenSummary, `${field}.spokenSummary`, errors);
  requiredString(business.blindCommunitySupport, `${field}.blindCommunitySupport`, errors);
  requiredString(business.accessibility, `${field}.accessibility`, errors);

  if (!isPlainObject(business.contact)) {
    errors.push(`${field}.contact must be an object.`);
  } else {
    optionalString(business.contact.name, `${field}.contact.name`, errors);
    optionalString(business.contact.email, `${field}.contact.email`, errors);
    optionalString(business.contact.phone, `${field}.contact.phone`, errors);
    optionalString(business.contact.text, `${field}.contact.text`, errors);
    if (business.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.contact.email)) {
      errors.push(`${field}.contact.email must be a valid email address.`);
    }
    for (const key of ["phone", "text"]) {
      if (business.contact[key] && business.contact[key].replace(/\D/g, "").length < 7) {
        errors.push(`${field}.contact.${key} must contain at least seven digits.`);
      }
    }
    validateWebUrl(business.contact.website, `${field}.contact.website`, errors);
    if (!preferredMethods.includes(business.contact.preferredMethod)) {
      errors.push(`${field}.contact.preferredMethod must be Phone, Text, Email, or Website.`);
    } else {
      const preferredField = {
        Phone: "phone",
        Text: "text",
        Email: "email",
        Website: "website"
      }[business.contact.preferredMethod];
      if (!business.contact[preferredField]) {
        errors.push(`${field}.contact.preferredMethod must refer to an available contact value.`);
      }
    }
    if (!Array.isArray(business.contact.socialLinks)) {
      errors.push(`${field}.contact.socialLinks must be an array.`);
    } else {
      for (const [socialIndex, social] of business.contact.socialLinks.entries()) {
        if (!isPlainObject(social)) {
          errors.push(`${field}.contact.socialLinks[${socialIndex}] must be an object.`);
          continue;
        }
        requiredString(social.label, `${field}.contact.socialLinks[${socialIndex}].label`, errors);
        requiredString(social.url, `${field}.contact.socialLinks[${socialIndex}].url`, errors);
        validateWebUrl(social.url, `${field}.contact.socialLinks[${socialIndex}].url`, errors);
      }
    }
    if (![business.contact.email, business.contact.phone, business.contact.text, business.contact.website].some(Boolean)) {
      errors.push(`${field}.contact must provide at least one public contact method.`);
    }
  }

  if (!isPlainObject(business.location)) {
    errors.push(`${field}.location must be an object.`);
  } else {
    optionalString(business.location.city, `${field}.location.city`, errors);
    optionalString(business.location.region, `${field}.location.region`, errors);
    requiredString(business.location.country, `${field}.location.country`, errors);
    requiredString(business.location.serviceArea, `${field}.location.serviceArea`, errors);
    if (typeof business.location.remoteAvailable !== "boolean") {
      errors.push(`${field}.location.remoteAvailable must be true or false.`);
    }
    optionalString(business.location.remoteDetails, `${field}.location.remoteDetails`, errors);
    optionalString(business.location.inPersonNotes, `${field}.location.inPersonNotes`, errors);
  }

  requiredString(business.hours, `${field}.hours`, errors);
  stringArray(business.languages, `${field}.languages`, errors, { allowEmpty: false });
  stringArray(business.certifications, `${field}.certifications`, errors);
  optionalString(business.testimonial, `${field}.testimonial`, errors);
  if (!isIsoDate(business.lastVerified)) {
    errors.push(`${field}.lastVerified must be a real date using YYYY-MM-DD.`);
  }
}

export function validateCatalog(catalog) {
  const errors = [];
  if (!isPlainObject(catalog)) {
    throw new Error("The business catalog must be a JSON object.");
  }
  if (catalog.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!isIsoDate(catalog.catalogUpdated)) {
    errors.push("catalogUpdated must be a real date using YYYY-MM-DD.");
  }
  if (!Array.isArray(catalog.businesses)) {
    errors.push("businesses must be an array.");
  } else {
    const ids = new Set();
    const legacyIds = new Set();
    const featuredRanks = new Set();
    catalog.businesses.forEach((business, index) => {
      validateBusiness(business, index, errors, ids, legacyIds, featuredRanks);
    });
  }
  if (errors.length) {
    throw new Error(`Invalid business catalog:\n- ${errors.join("\n- ")}`);
  }
  return catalog;
}

export function loadCatalog(filePath = defaultCatalogPath) {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read the business catalog at ${filePath}: ${error.message}`);
  }
  return validateCatalog(catalog);
}

export function activeBusinesses(catalog) {
  return catalog.businesses.filter((business) => business.status === "active");
}

function searchText(business) {
  return [
    business.name,
    business.listingType,
    ...business.categories,
    ...business.services,
    business.summary,
    business.description,
    business.blindCommunitySupport,
    business.accessibility,
    business.hours,
    ...business.languages,
    ...business.certifications,
    business.contact.name,
    business.contact.email,
    business.contact.phone,
    business.contact.text,
    business.contact.website,
    ...business.contact.socialLinks.flatMap((item) => [item.label, item.url]),
    business.location.city,
    business.location.region,
    business.location.country,
    business.location.serviceArea,
    business.location.remoteAvailable ? "remote online virtual" : ""
  ].filter(Boolean).join(" ").toLowerCase();
}

function supportsContactMethod(business, method) {
  const contact = business.contact;
  const methods = {
    phone: Boolean(contact.phone),
    text: Boolean(contact.text),
    email: Boolean(contact.email),
    website: Boolean(contact.website)
  };
  return !method || methods[method] === true;
}

export function searchBusinesses(catalog, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const category = String(filters.category || "").trim().toLowerCase();
  const listingType = String(filters.listingType || "").trim().toLowerCase();
  const location = String(filters.location || "").trim().toLowerCase();
  const contactMethod = String(filters.contactMethod || "").trim().toLowerCase();

  return activeBusinesses(catalog)
    .filter((business) => !query || searchText(business).includes(query))
    .filter((business) => !category || business.categories.some((item) => item.toLowerCase() === category))
    .filter((business) => !listingType || business.listingType.toLowerCase() === listingType)
    .filter((business) => {
      if (!location) return true;
      const locationText = [
        business.location.city,
        business.location.region,
        business.location.country,
        business.location.serviceArea,
        business.location.remoteAvailable ? "remote online virtual" : ""
      ].filter(Boolean).join(" ").toLowerCase();
      return locationText.includes(location);
    })
    .filter((business) => supportsContactMethod(business, contactMethod))
    .sort((left, right) => {
      if (left.featured.enabled !== right.featured.enabled) return left.featured.enabled ? -1 : 1;
      const leftRank = left.featured.rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.featured.rank ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.name.localeCompare(right.name);
    });
}

export function summarizeBusiness(business) {
  return {
    id: business.id,
    name: business.name,
    listingType: business.listingType,
    categories: business.categories,
    services: business.services,
    summary: business.summary,
    spokenSummary: business.spokenSummary,
    contact: {
      email: business.contact.email,
      phone: business.contact.phone,
      text: business.contact.text,
      website: business.contact.website,
      preferredMethod: business.contact.preferredMethod
    },
    location: business.location,
    featured: business.featured,
    lastVerified: business.lastVerified
  };
}

export function findBusiness(catalog, identifier) {
  const decoded = String(identifier || "").trim();
  const numericId = /^\d+$/.test(decoded) ? Number(decoded) : null;
  return activeBusinesses(catalog).find((business) => (
    business.id === decoded || (numericId !== null && business.legacyIds.includes(numericId))
  )) || null;
}

export function getDirectoryOptions(catalog) {
  const businesses = activeBusinesses(catalog);
  const categories = [...new Set([
    ...supportedCategories,
    ...businesses.flatMap((business) => business.categories)
  ])].sort((left, right) => left.localeCompare(right));
  const availableListingTypes = [...new Set(businesses.map((business) => business.listingType))]
    .sort((left, right) => left.localeCompare(right));
  return {
    businessCount: businesses.length,
    catalogUpdated: catalog.catalogUpdated,
    categories,
    listingTypes: availableListingTypes,
    contactMethods: [
      { value: "phone", label: "Phone" },
      { value: "text", label: "Text" },
      { value: "email", label: "Email" },
      { value: "website", label: "Website" }
    ]
  };
}
