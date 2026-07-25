import fs from "node:fs";
import vm from "node:vm";

const requiredFiles = ["index.html", "styles.css", "app.js", "parts-data.js", "sales-data.js", "uk-used-pc-parts-price-guide.md"];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.statSync(file).size) throw new Error(`${file} is empty`);
}

const html = fs.readFileSync("index.html", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML ids: ${[...new Set(duplicates)].join(", ")}`);

for (const script of ["parts-data.js", "sales-data.js", "app.js"]) {
  new vm.Script(fs.readFileSync(script, "utf8"), { filename: script });
}

const dataCode = fs.readFileSync("parts-data.js", "utf8").replace("window.PC_PARTS =", "globalThis.PC_PARTS =");
const context = {};
vm.createContext(context);
vm.runInContext(dataCode, context);
const records = context.PC_PARTS;
if (!Array.isArray(records) || records.length < 200) throw new Error(`Expected at least 200 price records; found ${records?.length ?? 0}`);

const salesCode = fs.readFileSync("sales-data.js", "utf8")
  .replace("window.PC_MARKET_SALES =", "globalThis.PC_MARKET_SALES =");
vm.runInContext(salesCode, context);
const marketSales = context.PC_MARKET_SALES;
if (!Array.isArray(marketSales?.components) || !Array.isArray(marketSales?.systems)) {
  throw new Error("Structured market-sale evidence is unavailable");
}

const categories = new Set(records.map((record) => record.category));
for (const category of ["cpu", "gpu", "motherboard", "ram", "storage", "psu", "case", "cooler"]) {
  if (!categories.has(category)) throw new Error(`No records for ${category}`);
}

for (const record of records) {
  if (!record.id || !record.name || !Number.isFinite(record.price) || record.price < 0) {
    throw new Error(`Invalid record: ${JSON.stringify(record)}`);
  }
}

const mockElements = new Map();
const makeMockElement = () => ({
  value: "",
  hidden: false,
  innerHTML: "",
  textContent: "",
  style: {},
  addEventListener() {},
  focus() {},
  setAttribute() {},
  removeAttribute() {},
  scrollIntoView() {},
});
context.document = {
  querySelector(selector) {
    if (!mockElements.has(selector)) mockElements.set(selector, makeMockElement());
    return mockElements.get(selector);
  },
};
context.window = { PC_PARTS: records, PC_MARKET_SALES: marketSales, scrollTo() {} };
vm.runInContext(fs.readFileSync("app.js", "utf8"), context);

const analyseDescription = context.window.RigWorth?.analyseDescription;
if (typeof analyseDescription !== "function") throw new Error("Matcher test hook is unavailable");

const repeatedStorage = analyseDescription("Storage: 1TB SSD\nSSD: 1TB SSD");
if (repeatedStorage.filter((match) => match.category === "storage").length !== 1) {
  throw new Error("Repeated mentions of the same storage device were counted twice");
}

const distinctStorage = analyseDescription("Storage: 1TB SSD\nHard drive: 1TB HDD");
if (distinctStorage.filter((match) => match.category === "storage").length !== 2) {
  throw new Error("Distinct SSD and HDD devices were incorrectly collapsed");
}

const correctedExample = context.window.RigWorth.estimateDescription(`
CPU: AMD Ryzen 7 5800X
GPU: NVIDIA GeForce RTX 4060
Motherboard: MSI B450 Tomahawk MAX
RAM: 32GB DDR4 3600MHz
Storage: 1TB NVMe SSD
`);
const nvmeMatch = correctedExample.matches.find((match) => match.category === "storage");
if (!nvmeMatch?.part?.name.includes("model and health unknown")) {
  throw new Error(`Explicit NVMe storage matched incorrectly: ${nvmeMatch?.part?.name ?? "none"}`);
}

for (const interfaceText of [
  "1TB NVMe SSD",
  "1TB NVME SSD",
  "1TB M.2 NVMe SSD",
  "1TB PCIe SSD",
  "1TB PCI-E SSD",
  "1TB Gen3 SSD",
  "1TB Gen4 SSD",
  "1TB Gen5 SSD",
]) {
  const storageMatch = analyseDescription(`Storage: ${interfaceText}`)
    .find((match) => match.category === "storage");
  const storagePart = records.find((record) => record.id === storageMatch?.partId);
  if (!storagePart || /interface unknown/i.test(storagePart.name) || !/nvme/i.test(storagePart.name)) {
    throw new Error(`${interfaceText} did not resolve to an explicit NVMe value: ${storagePart?.name ?? "none"}`);
  }
}

const ramDetail = correctedExample.valuation.partDetails.find((item) => item.part.category === "ram");
if (ramDetail?.valuation.low !== 85 || ramDetail?.valuation.high !== 150) {
  throw new Error(`Expected uncertain 32GB DDR4-3600 value range; found ${JSON.stringify(ramDetail?.valuation)}`);
}

const allowanceKeys = new Set(correctedExample.valuation.allowances.map((item) => item.key));
for (const key of ["case", "psu", "cooler"]) {
  if (!allowanceKeys.has(key)) throw new Error(`Missing conservative ${key} allowance`);
}

if (correctedExample.valuation.componentMid < 620 || correctedExample.valuation.componentMid > 635) {
  throw new Error(`Corrected component midpoint is out of range: ${correctedExample.valuation.componentMid}`);
}
if (correctedExample.valuation.completeParts.low < 650 || correctedExample.valuation.completeParts.high > 750) {
  throw new Error(`Complete-parts range is implausible: ${JSON.stringify(correctedExample.valuation.completeParts)}`);
}
if (correctedExample.valuation.exactComparableCount !== 0 || correctedExample.valuation.censoredComparableCount !== 1) {
  throw new Error("Best Offer/upper-bound comparable handling regressed");
}

console.log(`Checks passed: ${records.length} price records across ${categories.size} categories.`);
