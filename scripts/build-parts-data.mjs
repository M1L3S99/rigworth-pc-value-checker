import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = path.join(root, "uk-used-pc-parts-price-guide.md");
const outputPath = path.join(root, "parts-data.js");
const lines = fs.readFileSync(guidePath, "utf8").split(/\r?\n/);

const headingCategories = new Map([
  ["## AMD CPU values", "cpu"],
  ["## Intel CPU values", "cpu"],
  ["## NVIDIA GPU values", "gpu"],
  ["## AMD Radeon and Intel Arc GPU values", "gpu"],
  ["## Motherboard values", "motherboard"],
  ["### Generic motherboard fallback values", "motherboard"],
  ["## RAM values", "ram"],
  ["## Storage values", "storage"],
  ["## PSU values", "psu"],
  ["## Cooler and case values", "mixed"],
]);

const entries = [];
let category = null;
let headers = null;

const rangeOverrides = new Map([
  ["cpu|ryzen 7 5800x", { price: 140, priceLow: 132, priceHigh: 150, valuationConfidence: "medium", evidenceNote: "Recent UK private-sale evidence; Buyer Protection excluded." }],
  ["gpu|geforce rtx 4060", { price: 230, priceLow: 220, priceHigh: 241, valuationConfidence: "medium", evidenceNote: "Recent UK used-sale range." }],
  ["motherboard|msi b450 tomahawk max", { priceLow: 50, priceHigh: 60, valuationConfidence: "medium" }],
  ["storage|1tb m.2 nvme ssd", { price: 87, priceLow: 84, priceHigh: 90, valuationConfidence: "medium", evidenceNote: "Identifiable used NVMe evidence; delivery excluded." }],
]);

function cleanCell(value) {
  return value
    .trim()
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`/g, "");
}

function parseRow(line) {
  if (!line.startsWith("|") || /^\|\s*-/.test(line)) return null;
  return line.slice(1, -1).split("|").map(cleanCell);
}

function inferMixedCategory(name) {
  const text = name.toLowerCase();
  return /(case|nzxt h|corsair 4000|corsair 5000|meshify|fractal north|o11|nr200|montech)/.test(text)
    ? "case"
    : "cooler";
}

for (const line of lines) {
  if (line.startsWith("#")) {
    category = headingCategories.get(line.trim()) ?? null;
    headers = null;
    continue;
  }

  if (!category) continue;
  const cells = parseRow(line);
  if (!cells) continue;

  if (!headers) {
    headers = cells.map((cell) => cell.toLowerCase());
    continue;
  }

  const name = cells[0];
  const priceCell = cells.find((cell) => /^£[\d,]+$/.test(cell));
  if (!name || !priceCell) continue;

  const price = Number(priceCell.replace(/[£,]/g, ""));
  if (!Number.isFinite(price)) continue;

  const confidenceCell = cells.find((cell) => /^(high|medium|low)$/i.test(cell));
  const confidence = confidenceCell?.toLowerCase() ?? "medium";
  const recordCategory = category === "mixed" ? inferMixedCategory(name) : category;

  const secondCell = cells[1] ?? "";
  const isAliasColumn = /common listing|platform/i.test(headers[1] ?? "");
  const alias = isAliasColumn ? secondCell : "";

  entries.push({
    id: `${recordCategory}-${entries.length + 1}`,
    category: recordCategory,
    name,
    alias,
    price,
    confidence,
  });
}

for (const entry of entries) {
  const override = rangeOverrides.get(`${entry.category}|${entry.name}`.toLowerCase());
  if (override) Object.assign(entry, override);
}

const manualFallbacks = [
  { id: "ram-generic-16-ddr4", category: "ram", name: "16GB DDR4 (configuration unknown)", alias: "16GB RAM DDR4", price: 45, confidence: "medium" },
  { id: "ram-generic-32-ddr4-3600", category: "ram", name: "32GB DDR4 3600MHz (configuration/model unknown)", alias: "32GB RAM DDR4 3600 32GB DDR4-3600", price: 115, priceLow: 85, priceHigh: 150, confidence: "medium", valuationConfidence: "medium" },
  { id: "ram-generic-32-ddr4", category: "ram", name: "32GB DDR4 (configuration unknown)", alias: "32GB RAM DDR4", price: 100, priceLow: 75, priceHigh: 130, confidence: "medium", valuationConfidence: "medium" },
  { id: "ram-generic-16-ddr5", category: "ram", name: "16GB DDR5 (configuration unknown)", alias: "16GB RAM DDR5", price: 45, confidence: "medium" },
  { id: "ram-generic-32-ddr5", category: "ram", name: "32GB DDR5 (configuration unknown)", alias: "32GB RAM DDR5", price: 95, confidence: "medium" },
  { id: "storage-generic-500-ssd", category: "storage", name: "500GB SSD (interface unknown)", alias: "500GB SSD 512GB SSD", price: 35, confidence: "medium" },
  { id: "storage-generic-1tb-ssd", category: "storage", name: "1TB SSD (interface unknown)", alias: "1TB SSD 1000GB SSD", price: 75, confidence: "medium" },
  { id: "storage-generic-2tb-ssd", category: "storage", name: "2TB SSD (interface unknown)", alias: "2TB SSD", price: 145, confidence: "medium" },
  { id: "storage-generic-1tb-nvme", category: "storage", name: "1TB NVMe SSD — model and health unknown", alias: "1TB NVMe SSD 1TB NVME M.2 NVMe PCIe SSD PCI-E SSD Gen3 SSD Gen4 SSD Gen5 SSD", price: 87, priceLow: 84, priceHigh: 90, confidence: "medium", valuationConfidence: "medium" },
  { id: "psu-generic-corsair", category: "psu", name: "Corsair PSU (model and wattage unknown)", alias: "Corsair power supply Corsair PSU", price: 23, priceLow: 15, priceHigh: 30, confidence: "low", valuationConfidence: "low" },
  { id: "psu-generic-500", category: "psu", name: "500W PSU (brand/model unknown)", alias: "500 watt power supply 500W PSU", price: 18, priceLow: 10, priceHigh: 25, confidence: "low", valuationConfidence: "low" },
  { id: "psu-generic-600", category: "psu", name: "600–650W PSU (brand/model unknown)", alias: "600W PSU 650W PSU power supply", price: 23, priceLow: 15, priceHigh: 30, confidence: "low", valuationConfidence: "low" },
  { id: "case-generic", category: "case", name: "Unknown functional case", alias: "PC case gaming case chassis", price: 30, priceLow: 20, priceHigh: 40, confidence: "low", valuationConfidence: "low" },
  { id: "cooler-generic", category: "cooler", name: "Unknown functional CPU cooler", alias: "CPU cooler air cooler heatsink", price: 15, priceLow: 10, priceHigh: 20, confidence: "low", valuationConfidence: "low" },
];

const unique = new Map();
for (const entry of [...entries, ...manualFallbacks]) {
  const key = `${entry.category}|${entry.name}`.toLowerCase();
  if (!unique.has(key)) unique.set(key, entry);
}

const finalEntries = [...unique.values()];
const generated = `// Generated from uk-used-pc-parts-price-guide.md by scripts/build-parts-data.mjs\n` +
  `window.PC_PARTS = ${JSON.stringify(finalEntries, null, 2)};\n`;

fs.writeFileSync(outputPath, generated, "utf8");
console.log(`Generated ${finalEntries.length} price records in ${path.basename(outputPath)}.`);
