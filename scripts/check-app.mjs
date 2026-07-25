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
const estimateDescription = context.window.RigWorth?.estimateDescription;
const extractComponentEntities = context.window.RigWorth?.extractComponentEntities;
if (typeof estimateDescription !== "function" || typeof extractComponentEntities !== "function") {
  throw new Error("Entity/valuation test hooks are unavailable");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function matchFor(estimate, category, predicate = () => true) {
  return estimate.matches.find((match) => match.category === category && predicate(match));
}

function assertRange(valuation, low, high, label) {
  assert(
    valuation?.low === low && valuation?.high === high,
    `${label} range should be £${low}–£${high}; found ${JSON.stringify(valuation)}`,
  );
}

const repeatedStorage = analyseDescription("Storage: 1TB SSD\nSSD: 1TB SSD");
assert(
  repeatedStorage.filter((match) => match.category === "storage").length === 1,
  "Repeated mentions of the same storage device were counted twice",
);

const distinctStorage = analyseDescription("Storage: 1TB SSD\nHard drive: 1TB HDD");
assert(
  distinctStorage.filter((match) => match.category === "storage").length === 2,
  "Distinct SSD and HDD devices were incorrectly collapsed",
);

for (const [description, expected] of [
  ["AMD Ryzen 5 4500, 6-Core Processor", "Ryzen 5 4500"],
  ["AMD Ryzen 7 5800X", "Ryzen 7 5800X"],
  ["Intel Core i5-12400F", "Core i5-12400F"],
]) {
  const estimate = estimateDescription(description);
  const cpu = matchFor(estimate, "cpu");
  assert(cpu?.part?.name === expected, `${description} matched ${cpu?.part?.name ?? "nothing"}`);
  assert(cpu.matched && cpu.familyIdentification === "high", `${description} was not a high-confidence safe match`);
}

const ryzen4500 = estimateDescription("AMD Ryzen 5 4500, 6-Core Processor");
assert(
  !ryzen4500.matches.some((match) => /Core Ultra 5 245K/i.test(match.part?.name ?? "")),
  "AMD Ryzen 5 4500 was allowed to cross-match Intel Core Ultra 5 245K",
);
const manufacturerConflict = estimateDescription("CPU: AMD Core Ultra 5 245K");
assert(
  matchFor(manufacturerConflict, "cpu")?.matched === false,
  "An explicit AMD/Intel manufacturer conflict was not returned as unmatched",
);
const gpuManufacturerConflict = estimateDescription("GPU: NVIDIA Radeon RX 6600");
assert(
  matchFor(gpuManufacturerConflict, "gpu")?.matched === false,
  "An explicit NVIDIA/AMD manufacturer conflict was not returned as unmatched",
);

const rtx3050 = estimateDescription("NVIDIA GeForce RTX 3050");
const rtx3050Match = matchFor(rtx3050, "gpu");
assert(
  rtx3050Match?.part?.id === "gpu-rtx-3050-unspecified",
  `Unspecified RTX 3050 silently selected ${rtx3050Match?.part?.name ?? "nothing"}`,
);
assert(
  rtx3050Match.familyIdentification === "high" && rtx3050Match.variantIdentification === "low",
  "Generic RTX 3050 did not preserve high family/low variant confidence",
);
assertRange(rtx3050.valuation.partDetails.find((item) => item.part.id === "gpu-rtx-3050-unspecified")?.valuation, 100, 155, "Generic RTX 3050");
const rtxAlternatives = rtx3050Match.alternatives.map((id) => records.find((record) => record.id === id)?.name ?? "");
assert(rtxAlternatives.includes("GeForce RTX 3050 6GB"), "RTX 3050 6GB correction alternative is missing");
assert(rtxAlternatives.includes("GeForce RTX 3050 8GB"), "RTX 3050 8GB correction alternative is missing");

const wdEstimate = estimateDescription("Storage: WD Green SN3000 1TB");
const wdMatch = matchFor(wdEstimate, "storage");
assert(wdMatch?.part?.id === "storage-wd-green-sn3000-1tb", `WD Green SN3000 matched ${wdMatch?.part?.name ?? "nothing"}`);
assert(wdMatch.part.interface === "NVMe", "WD Green SN3000 interface metadata is not NVMe");
assert(wdMatch.part.formFactor === "M.2 2280", "WD Green SN3000 form factor metadata is wrong");
assert(wdMatch.part.bus === "PCIe Gen4 x4", "WD Green SN3000 bus metadata is wrong");
assert(wdMatch.part.manufacturerModel === "WDS100T4G0E", "WD Green SN3000 manufacturer model is wrong");
assert(wdMatch.resolvedInterface === "nvme", "WD Green SN3000 did not infer NVMe from exact model metadata");
assert(wdMatch.inferences.some((note) => /exact catalogue model/i.test(note)), "WD Green SN3000 interface inference is absent from the audit trail");
assertRange(wdEstimate.valuation.partDetails.find((item) => item.part.id === wdMatch.part.id)?.valuation, 65, 85, "WD Green SN3000 1TB");
assert(!wdEstimate.warningsHtml.includes("SSD interface missing"), "Exact WD SN3000 metadata still triggers the SSD-interface warning");

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
  assert(
    storagePart && !/interface unknown/i.test(storagePart.name) && /nvme/i.test(storagePart.name),
    `${interfaceText} did not resolve to an explicit NVMe value: ${storagePart?.name ?? "none"}`,
  );
}

const ryzenFixture = fs.readFileSync("tests/fixtures/ryzen-4500-rtx-3050.txt", "utf8");
const fixtureEstimate = estimateDescription(ryzenFixture);
const fixtureCpu = matchFor(fixtureEstimate, "cpu");
const fixtureGpu = matchFor(fixtureEstimate, "gpu");
const fixtureRam = matchFor(fixtureEstimate, "ram");
const fixtureSsd = matchFor(fixtureEstimate, "storage");
assert(fixtureCpu?.part?.id === "cpu-ryzen-5-4500", "Ryzen fixture CPU identification regressed");
assertRange(fixtureEstimate.valuation.partDetails.find((item) => item.part.id === fixtureCpu.part.id)?.valuation, 40, 55, "Ryzen 5 4500");
assert(fixtureCpu.familyIdentification === "high", "Ryzen 5 4500 identification is not high");
assert(fixtureGpu?.part?.id === "gpu-rtx-3050-unspecified", "Ryzen fixture must keep RTX 3050 VRAM unknown");
assertRange(fixtureEstimate.valuation.partDetails.find((item) => item.part.id === fixtureGpu.part.id)?.valuation, 100, 155, "RTX 3050 unspecified");
assert(fixtureGpu.variantIdentification === "low", "Ryzen fixture GPU variant is not uncertain");
assert(fixtureRam?.part?.id === "ram-generic-16-ddr4", `Ryzen fixture RAM matched ${fixtureRam?.part?.name ?? "nothing"}`);
assertRange(fixtureEstimate.valuation.partDetails.find((item) => item.part.id === fixtureRam.part.id)?.valuation, 30, 60, "16GB DDR4 unknown configuration");
assert(fixtureSsd?.part?.id === "storage-wd-green-sn3000-1tb", "Ryzen fixture SSD identification regressed");
assertRange(fixtureEstimate.valuation.partDetails.find((item) => item.part.id === fixtureSsd.part.id)?.valuation, 65, 85, "Ryzen fixture SSD");
const fixtureAllowances = new Map(fixtureEstimate.valuation.allowances.map((item) => [item.key, item]));
assertRange(fixtureAllowances.get("motherboard"), 25, 45, "Unknown functional AM4 motherboard");
assert(!fixtureAllowances.has("wifi"), "Negated/not-included Wi-Fi received a non-zero allowance");
assert(!fixtureAllowances.has("windows"), "Unevidenced Windows activation/licence received value");
assert(!fixtureEstimate.warningsHtml.includes("SSD interface missing"), "Ryzen fixture still shows an SSD-interface warning");
assert(fixtureEstimate.valuation.sampleCount >= 10_000, "Component fallback ran fewer than 10,000 samples");
assert(
  fixtureEstimate.valuation.percentiles.p25 <= fixtureEstimate.valuation.percentiles.p50
    && fixtureEstimate.valuation.percentiles.p50 <= fixtureEstimate.valuation.percentiles.p75,
  "Monte Carlo P25/P50/P75 are not ordered",
);
assert(
  fixtureEstimate.valuation.fair.low >= 320 && fixtureEstimate.valuation.fair.high <= 415,
  `Ryzen fixture private-sale range is outside the expected neighbourhood: ${JSON.stringify(fixtureEstimate.valuation.fair)}`,
);
assert(
  fixtureEstimate.valuation.clean.high < 430,
  `Ryzen fixture clean/tested upper estimate exceeded £430: ${JSON.stringify(fixtureEstimate.valuation.clean)}`,
);
const likeNewEstimate = estimateDescription(ryzenFixture.replace("clean and tested", "like new"));
assert(
  likeNewEstimate.valuation.conditionNotes.length === 0
    && likeNewEstimate.valuation.clean.high <= likeNewEstimate.valuation.percentiles.p50,
  "Seller wording 'like new' incorrectly created a condition uplift",
);
const includedWifiEstimate = estimateDescription(
  ryzenFixture.replace(
    "No built-in WiFi. An adapter can be added, but the adapter is not included.",
    "Includes a Wi-Fi adapter.",
  ),
);
assert(
  includedWifiEstimate.valuation.allowances.some((item) => item.key === "wifi" && item.low === 5 && item.high === 15),
  "An explicitly included Wi-Fi adapter was not valued",
);

const entityFixture = fs.readFileSync("tests/fixtures/gtx-1080-i5-8400-entities.txt", "utf8");
const entities = extractComponentEntities(entityFixture);
assert(entities.filter((entity) => entity.componentType === "gpu").length === 1, "GTX 1080 fixture did not extract exactly one GPU");
assert(entities.filter((entity) => entity.componentType === "cpu").length === 1, "GTX 1080 fixture did not extract exactly one CPU");
const psuEntity = entities.find((entity) => entity.componentType === "psu");
assert(psuEntity?.wattage === 500 && psuEntity.manufacturer === null, "Unknown-brand 500W PSU entity is wrong");
const storageEntities = entities.filter((entity) => entity.componentType === "storage");
assert(storageEntities.length === 2, `Expected two storage entities; found ${storageEntities.length}`);
assert(storageEntities.some((entity) => entity.totalCapacity === 256 && entity.storageMedium === "ssd"), "256GB SSD entity is missing");
assert(storageEntities.some((entity) => entity.totalCapacity === 1000 && entity.storageMedium === "hdd"), "1TB HDD entity is missing");
assert(!storageEntities.some((entity) => entity.totalCapacity === 1000 && entity.storageMedium === "ssd"), "Conjoined storage was converted into a 1TB SSD");
const ramEntity = entities.find((entity) => entity.componentType === "ram");
assert(
  ramEntity?.quantity === 3 && ramEntity.unitCapacity === 4 && ramEntity.totalCapacity === 12,
  `3×4GB RAM arithmetic is wrong: ${JSON.stringify(ramEntity)}`,
);
for (const ramText of [
  "3x4GB DDR4 RAM",
  "3 × 4 GB DDR4 RAM",
  "three 4GB sticks DDR4 RAM",
  "4GB x3 DDR4 RAM",
]) {
  const entity = extractComponentEntities(ramText).find((item) => item.componentType === "ram");
  assert(
    entity?.quantity === 3 && entity.unitCapacity === 4 && entity.totalCapacity === 12,
    `${ramText} did not retain 3×4GB = 12GB arithmetic: ${JSON.stringify(entity)}`,
  );
}
const mixedLineEntities = extractComponentEntities("16GB DDR4 RAM and 1TB SSD");
assert(
  mixedLineEntities.some((entity) => entity.componentType === "ram" && entity.totalCapacity === 16)
    && mixedLineEntities.some((entity) => entity.componentType === "storage" && entity.totalCapacity === 1000),
  "Mixed RAM/storage line did not produce two independent entities",
);
assert(
  !(mixedLineEntities[0].sourceStart < mixedLineEntities[1].sourceEnd
    && mixedLineEntities[1].sourceStart < mixedLineEntities[0].sourceEnd),
  "Mixed RAM/storage entities consumed overlapping source spans",
);
for (let left = 0; left < entities.length; left += 1) {
  for (let right = left + 1; right < entities.length; right += 1) {
    const overlaps = entities[left].sourceStart < entities[right].sourceEnd
      && entities[right].sourceStart < entities[left].sourceEnd;
    assert(!overlaps, `Component source spans overlap: ${entities[left].sourceText} / ${entities[right].sourceText}`);
  }
}
const entityEstimate = estimateDescription(entityFixture);
assert(matchFor(entityEstimate, "gpu")?.part?.name === "GeForce GTX 1080", "GTX 1080 fixture GPU match is wrong");
assert(matchFor(entityEstimate, "cpu")?.part?.name === "Core i5-8400", "GTX 1080 fixture CPU match is wrong");
assert(matchFor(entityEstimate, "psu")?.part?.id === "psu-generic-500", "GTX 1080 fixture PSU match is wrong");
assert(entityEstimate.matches.filter((match) => match.category === "storage").length === 2, "SSD and HDD catalogue matches were merged");
assert(
  entityEstimate.matches.some((match) => match.part?.id === "storage-generic-256-ssd"),
  `256GB SSD generic match is missing: ${entityEstimate.matches.filter((match) => match.category === "storage").map((match) => match.part?.name).join(", ")}`,
);
assert(
  entityEstimate.matches.some((match) => match.part?.id === "storage-generic-1tb-hdd"),
  `1TB HDD generic match is missing: ${entityEstimate.matches.filter((match) => match.category === "storage").map((match) => match.part?.name).join(", ")}`,
);
assert(matchFor(entityEstimate, "ram")?.part?.id === "ram-generic-12-ddr4-3x4", "12GB 3×4GB RAM was snapped to another capacity");
assert(!entityEstimate.matches.some((match) => /\b16GB\b/i.test(match.part?.name ?? "")), "12GB RAM was silently upgraded to 16GB");
assertRange(
  entityEstimate.valuation.allowances.find((item) => item.key === "motherboard"),
  30,
  50,
  "Unknown compatible Intel 300-series motherboard",
);

const ebayFixture = fs.readFileSync("tests/fixtures/ebay-358840159028.txt", "utf8");
const ebayEstimate = estimateDescription(ebayFixture);
const ebayCpu = matchFor(ebayEstimate, "cpu");
const ebayGpu = matchFor(ebayEstimate, "gpu");
const ebayRam = matchFor(ebayEstimate, "ram");
const ebayStorage = matchFor(ebayEstimate, "storage");
const ebayPsu = matchFor(ebayEstimate, "psu");
assert(ebayCpu?.part?.id === "cpu-intel-core-i7-10700f", `eBay fixture CPU matched ${ebayCpu?.part?.name ?? "nothing"}`);
assertRange(
  ebayEstimate.valuation.partDetails.find((item) => item.part.id === ebayCpu.part.id)?.valuation,
  95,
  115,
  "Core i7-10700F",
);
assert(ebayCpu.familyIdentification === "high", "i7-10700F shorthand identification is not high");
assert(ebayGpu?.part?.id === "gpu-geforce-gtx-1650", `eBay fixture GPU matched ${ebayGpu?.part?.name ?? "nothing"}`);
assertRange(
  ebayEstimate.valuation.partDetails.find((item) => item.part.id === ebayGpu.part.id)?.valuation,
  50,
  70,
  "GeForce GTX 1650",
);
assert(
  matchFor(estimateDescription("GPU: NVIDIA GeForce 1650"), "gpu")?.part?.id === "gpu-geforce-gtx-1650",
  "Common eBay omission 'NVIDIA GeForce 1650' did not safely alias GTX 1650",
);
assert(ebayRam?.part?.id === "ram-ddr4-16-1x16-2400", `eBay fixture RAM matched ${ebayRam?.part?.name ?? "nothing"}`);
assert(
  ebayRam.entity.quantity === 1
    && ebayRam.entity.unitCapacity === 16
    && ebayRam.entity.totalCapacity === 16
    && ebayRam.entity.speedMhz === 2400,
  `eBay fixture RAM arithmetic/speed is wrong: ${JSON.stringify(ebayRam.entity)}`,
);
assertRange(
  ebayEstimate.valuation.partDetails.find((item) => item.part.id === ebayRam.part.id)?.valuation,
  30,
  45,
  "16GB DDR4-2400 1×16GB",
);
assert(
  matchFor(estimateDescription("RAM: 1x16GB DDR4 2666MHz"), "ram")?.part?.id === "ram-ddr4-16-1x16-2666",
  "DDR4-2666 was incorrectly snapped to the DDR4-2400 record",
);
assert(
  ebayStorage?.part?.id === "storage-generic-1tb-sata-2.5",
  `eBay fixture storage matched ${ebayStorage?.part?.name ?? "nothing"}`,
);
assert(
  ebayStorage.entity.interface === "sata" && ebayStorage.entity.formFactor === "2.5-inch",
  `eBay fixture storage metadata is wrong: ${JSON.stringify(ebayStorage.entity)}`,
);
assertRange(
  ebayEstimate.valuation.partDetails.find((item) => item.part.id === ebayStorage.part.id)?.valuation,
  55,
  75,
  "1TB 2.5-inch SATA SSD",
);
assert(!ebayEstimate.warningsHtml.includes("SSD interface missing"), "Explicit 2.5-inch SATA SSD still triggers an interface warning");
assert(!ebayEstimate.warningsHtml.includes("PSU wattage missing"), "Exact Corsair CV450 metadata still triggers a wattage warning");
assert(ebayPsu?.part?.id === "psu-corsair-cv450", `eBay fixture PSU matched ${ebayPsu?.part?.name ?? "nothing"}`);
assertRange(
  ebayEstimate.valuation.partDetails.find((item) => item.part.id === ebayPsu.part.id)?.valuation,
  18,
  27,
  "Corsair CV450",
);
const ebayAllowances = new Map(ebayEstimate.valuation.allowances.map((item) => [item.key, item]));
assertRange(ebayAllowances.get("motherboard"), 35, 55, "Unknown functional LGA1200 motherboard");
assert(ebayAllowances.has("case") && ebayAllowances.has("cooler"), "Complete eBay PC is missing case/cooler allowances");
assert(!ebayAllowances.has("windows"), "Windows 11 Home without activation/transfer evidence received value");
assert(
  ebayEstimate.matches.filter((match) => match.matched).length === 5 && ebayEstimate.valuation.allowances.length === 3,
  `eBay fixture should contain five exact matches plus three inferred essentials: ${JSON.stringify({
    matches: ebayEstimate.matches.map((match) => match.part?.name),
    allowances: ebayEstimate.valuation.allowances.map((item) => item.label),
  })}`,
);
assert(
  ebayEstimate.valuation.exactComparableCount === 0
    && ebayEstimate.valuation.percentiles.p50 < 481,
  "The supplied active £481 asking price was incorrectly treated as a sold comparable",
);
for (const expansionId of [
  "cpu-intel-core-i5-10500",
  "cpu-intel-core-i7-11700f",
  "motherboard-unknown-lga1700",
  "motherboard-unknown-am5",
  "ram-ddr4-16-2x8-2666",
  "ram-ddr4-32-2x16-2400",
  "psu-generic-450",
  "psu-generic-1000",
]) {
  assert(records.some((record) => record.id === expansionId), `Catalogue expansion record is missing: ${expansionId}`);
}

const systemsLength = marketSales.systems.length;
marketSales.systems.push(
  {
    id: "test-sold-1", soldDate: "2026-07-20", itemPrice: 360, sellerType: "private",
    condition: "used", priceType: "exact", cpu: "Ryzen 5 4500", gpu: "RTX 3050",
    ramGb: 16, ssdGb: 1000, hddGb: 0,
  },
  {
    id: "test-sold-2", soldDate: "2026-07-10", itemPrice: 380, sellerType: "private",
    condition: "used", priceType: "exact", cpu: "Ryzen 5 4500", gpu: "RTX 3050",
    ramGb: 16, ssdGb: 1000, hddGb: 0,
  },
  {
    id: "test-active-outlier", soldDate: "2026-07-24", itemPrice: 900, sellerType: "business",
    condition: "new", priceType: "exact", listingStatus: "active", cpu: "Ryzen 5 4500",
    gpu: "RTX 3050", ramGb: 16, ssdGb: 1000, hddGb: 0,
  },
  {
    id: "test-best-offer", soldDate: "2026-07-23", itemPrice: 800, sellerType: "private",
    condition: "used", priceType: "exact", acceptedBestOfferUnknown: true, cpu: "Ryzen 5 4500",
    gpu: "RTX 3050", ramGb: 16, ssdGb: 1000, hddGb: 0,
  },
);
const comparableEstimate = estimateDescription(ryzenFixture);
assert(comparableEstimate.valuation.exactComparableCount === 2, "Active/new/unknown-Best-Offer comparables were not excluded");
assert(comparableEstimate.valuation.censoredComparableCount >= 1, "Unknown accepted Best Offer was not marked as censored");
assert(comparableEstimate.valuation.percentiles.p50 < 500, "Comparable estimate was distorted by excluded high asking prices");
marketSales.systems.splice(systemsLength);

console.log(`Checks passed: ${records.length} price records across ${categories.size} categories.`);
console.log(
  `Ryzen fixture: P25 £${fixtureEstimate.valuation.percentiles.p25}, `
  + `P50 £${fixtureEstimate.valuation.percentiles.p50}, `
  + `P75 £${fixtureEstimate.valuation.percentiles.p75}, `
  + `clean upper £${fixtureEstimate.valuation.clean.high}.`,
);
console.log(
  `eBay 358840159028 fixture: P25 £${ebayEstimate.valuation.percentiles.p25}, `
  + `P50 £${ebayEstimate.valuation.percentiles.p50}, `
  + `P75 £${ebayEstimate.valuation.percentiles.p75}.`,
);
