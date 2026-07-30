import { activeBusinesses, loadCatalog } from "./directory-data.js";

const catalog = loadCatalog();
const count = activeBusinesses(catalog).length;
console.log(`Business catalog is valid: ${count} active business${count === 1 ? "" : "es"}.`);
