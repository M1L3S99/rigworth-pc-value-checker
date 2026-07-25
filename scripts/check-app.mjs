import fs from "node:fs";
import vm from "node:vm";

const requiredFiles = ["index.html", "styles.css", "app.js", "parts-data.js", "uk-used-pc-parts-price-guide.md"];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.statSync(file).size) throw new Error(`${file} is empty`);
}

const html = fs.readFileSync("index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicates)].join(", ")}`);

for (const script of ["parts-data.js", "app.js"]) {
  new vm.Script(fs.readFileSync(script, "utf8"), { filename: script });
}

const dataCode = fs.readFileSync("parts-data.js", "utf8").replace("window.PC_PARTS =", "globalThis.PC_PARTS =");
const context = {};
vm.createContext(context);
vm.runInContext(dataCode, context);
const records = context.PC_PARTS;
if (!Array.isArray(records) || records.length < 200) throw new Error(`Expected at least 200 price records; found ${records?.length ?? 0}`);

const categories = new Set(records.map((record) => record.category));
for (const category of ["cpu", "gpu", "motherboard", "ram", "storage", "psu", "case", "cooler"]) {
  if (!categories.has(category)) throw new Error(`No records for ${category}`);
}

for (const record of records) {
  if (!record.id || !record.name || !Number.isFinite(record.price) || record.price < 0) {
    throw new Error(`Invalid record: ${JSON.stringify(record)}`);
  }
}

console.log(`Checks passed: ${records.length} price records across ${categories.size} categories.`);
