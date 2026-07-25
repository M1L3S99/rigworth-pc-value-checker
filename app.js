(() => {
  "use strict";

  const parts = Array.isArray(window.PC_PARTS) ? window.PC_PARTS : [];
  const marketSales = window.PC_MARKET_SALES ?? { referenceDate: "2026-07-25", components: [], systems: [] };
  const byId = new Map(parts.map((part) => [part.id, part]));
  const state = { matches: [], description: "" };
  let uidCounter = 0;

  const elements = {
    description: document.querySelector("#descriptionInput"),
    valueButton: document.querySelector("#valueButton"),
    clearButton: document.querySelector("#clearButton"),
    exampleButton: document.querySelector("#exampleButton"),
    editDescriptionButton: document.querySelector("#editDescriptionButton"),
    emptyState: document.querySelector("#emptyState"),
    resultsContent: document.querySelector("#resultsContent"),
    resultsSection: document.querySelector("#resultsSection"),
    partsList: document.querySelector("#partsList"),
    partsTotal: document.querySelector("#partsTotal"),
    allowanceValue: document.querySelector("#allowanceValue"),
    allowanceSummary: document.querySelector("#allowanceSummary"),
    completePartsValue: document.querySelector("#completePartsValue"),
    quickValue: document.querySelector("#quickValue"),
    fairValue: document.querySelector("#fairValue"),
    cleanValue: document.querySelector("#cleanValue"),
    matchCount: document.querySelector("#matchCount"),
    matchSummary: document.querySelector("#matchSummary"),
    overallConfidence: document.querySelector("#overallConfidence"),
    overallConfidenceDot: document.querySelector("#overallConfidenceDot"),
    warningsList: document.querySelector("#warningsList"),
    valuationMethod: document.querySelector("#valuationMethod"),
    manualSearch: document.querySelector("#manualPartSearch"),
    addPartButton: document.querySelector("#addPartButton"),
  };

  const CATEGORY_META = {
    cpu: { label: "Processor", short: "CPU", required: true },
    gpu: { label: "Graphics", short: "GPU", required: false },
    motherboard: { label: "Motherboard", short: "MB", required: true },
    ram: { label: "Memory", short: "RAM", required: true },
    storage: { label: "Storage", short: "SSD", required: true },
    psu: { label: "Power supply", short: "PSU", required: true },
    case: { label: "Case", short: "CASE", required: true },
    cooler: { label: "Cooling", short: "COOL", required: true },
  };

  const STOP_TOKENS = new Set([
    "amd", "intel", "nvidia", "geforce", "radeon", "core", "processor",
    "graphics", "card", "desktop", "exact", "basic", "generic", "ordinary",
    "working", "model", "unknown", "configuration", "the", "and", "with",
    "for", "gaming", "used", "part", "power", "supply",
  ]);

  const exampleText = `CPU: AMD Ryzen 5 3600
GPU: NVIDIA GeForce RTX 2070 (8GB)
Motherboard: MSI MPG X570 Gaming Edge WiFi
RAM: 16GB DDR4 Memory
Storage: 500GB SSD
PSU: Corsair 650W`;

  function normalize(value) {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[×]/g, "x")
      .replace(/\b255\s*gb\b/g, "256gb")
      .replace(/\b1000\s*gb\b/g, "1tb")
      .replace(/\b1024\s*gb\b/g, "1tb")
      .replace(/\bsolid[\s-]*state(?:\s+drive)?\b/g, "ssd")
      .replace(/\bhard[\s-]*(?:disk|drive)\b/g, "hdd")
      .replace(/\bhd\b/g, "hdd")
      .replace(/\bm[\s.]*2\b/g, "m2")
      .replace(/\bpci[\s-]*e(?:xpress)?\s*(?:ssd)?\b/g, "nvme ssd")
      .replace(/\bgen\s*([345])\s*(?:nvme\s*)?ssd\b/g, "nvme gen$1 ssd")
      .replace(/\b(\d+)\s*(gb|tb|mhz|w)\b/g, "$1$2")
      .replace(/\brtx\s*5060\s+16(?:gb)?\b/g, "rtx 5060 ti 16gb")
      .replace(/\brtx\s*4060\s+16(?:gb)?\b/g, "rtx 4060 ti 16gb")
      .replace(/[^a-z0-9+.-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "");
  }

  function tokenise(value) {
    return normalize(value).split(" ").filter(Boolean);
  }

  function usefulTokens(value) {
    return tokenise(value).filter((token) => !STOP_TOKENS.has(token));
  }

  function aliasesFor(part) {
    const candidates = new Set([part.name, part.alias].filter(Boolean));
    const name = normalize(part.name);

    candidates.add(name.replace(/\b(?:amd|intel|nvidia|geforce|radeon)\b/g, " "));
    candidates.add(name.replace(/\bcore\s+(i[3579])\b/g, "$1"));
    candidates.add(name.replace(/\bryzen\s+([3579])\b/g, "r$1"));
    candidates.add(name.replace(/\bgeforce\s+(rtx|gtx|gt)\b/g, "$1"));

    const model = name.match(/\b(?:rtx|gtx|gt|rx|arc|i[3579]|r[3579])?\s*\d{3,5}(?:x3d|xt|ti|super|k|kf|f|g|x|s)?\b/);
    if (model) candidates.add(model[0]);

    if (/rtx 3060 12gb/.test(name)) candidates.add("rtx3060");
    if (/configuration unknown/.test(name)) {
      candidates.add(name.replace(/\(.*?\)/g, ""));
    }

    return [...candidates]
      .flatMap((candidate) => [normalize(candidate), compact(candidate)])
      .filter((candidate) => candidate.length >= 4);
  }

  for (const part of parts) {
    part._aliases = aliasesFor(part);
    part._tokens = usefulTokens(`${part.name} ${part.alias}`);
  }

  function detectCategories(segment) {
    const text = normalize(segment);
    const categories = [];
    const push = (category, condition) => {
      if (condition && !categories.includes(category)) categories.push(category);
    };

    push("cpu", /\b(cpu|processor|ryzen|threadripper|fx\d|a\d-\d|core i[3579]|i[3579][ -]?\d{4,5}(?:k|kf|f|s|t)?)\b/.test(text));
    push("gpu", /\b(gpu|graphics|video card|geforce|rtx(?:\s?\d{4})?|gtx(?:\s?\d{3,4})?|radeon|rx ?\d{3,4}|arc [ab]\d{3})\b/.test(text));
    push("motherboard", /\b(motherboard|mobo|mainboard|a320|b350|b450|b550|b650|b660|b760|b850|x370|x470|x570|x670|x870|z77|z87|z97|z170|z270|z370|z390|z490|z590|z690|z790|z890|h61|h81|h110)\b/.test(text));
    push("ram", /\b(ram|memory|ddr[345]|dimm|sodimm)\b/.test(text));
    push("storage", /\b(storage|ssd|hdd|nvme|m2|hard drive|hard disk|barracuda|ironwolf|sn\d{3}|evo|mx500)\b/.test(text));
    push("psu", /\b(psu|power supply|corsair (?:cv|cx|rm|sf)|seasonic focus|evga supernova|pure power|system power|mwe|a650bn|a750gl)\b/.test(text));
    push("case", /\b(case|chassis|4000d|5000d|meshify|fractal north|o11|nr200|h510|h5 flow|air 903)\b/.test(text));
    push("cooler", /\b(cooler|heatsink|aio|hyper 212|nh-d15|nh-u12|peerless assassin|phantom spirit|liquid freezer|h100i|kraken)\b/.test(text));
    return categories;
  }

  function scoreCandidate(part, source, expectedCategory = null) {
    const text = normalize(source);
    const textCompact = compact(source);
    const partText = normalize(part.name);
    const inputTokens = new Set(usefulTokens(source));
    let score = 0;

    for (const alias of part._aliases) {
      if (!alias) continue;
      const isCompactAlias = !alias.includes(" ");
      const haystack = isCompactAlias ? textCompact : text;
      if (haystack.includes(alias)) {
        score = Math.max(score, 0.82 + Math.min(0.15, alias.length / 90));
      }
    }

    let matchedWeight = 0;
    let totalWeight = 0;
    for (const token of part._tokens) {
      const numeric = /\d/.test(token);
      const weight = numeric ? 3 : 1;
      totalWeight += weight;
      if (inputTokens.has(token) || textCompact.includes(token.replace(/[^a-z0-9]/g, ""))) {
        matchedWeight += weight;
      }
    }

    if (totalWeight) score = Math.max(score, (matchedWeight / totalWeight) * 0.83);
    if (expectedCategory === part.category) score += 0.06;

    const modelTokens = part._tokens.filter((token) => /\d{3,}/.test(token));
    if (modelTokens.some((token) => textCompact.includes(token.replace(/[^a-z0-9]/g, "")))) {
      score += 0.11;
    }

    const inputCapacities = [...text.matchAll(/\b(\d+)(gb|tb)\b/g)].map((match) => match[0]);
    const partCapacities = [...normalize(part.name).matchAll(/\b(\d+)(gb|tb)\b/g)].map((match) => match[0]);
    if (inputCapacities.length && partCapacities.length) {
      if (partCapacities.some((capacity) => inputCapacities.includes(capacity))) score += 0.06;
      else score -= 0.18;
    }

    if (/configuration unknown|interface unknown/.test(normalize(part.name))) {
      const hasSpecificConfiguration = /\b(2x|4x|sata|nvme|m2|pcie)\b/.test(text);
      score += hasSpecificConfiguration ? -0.08 : 0.08;
    }

    const inputSpecifiesNvme = /\b(nvme|gen[345])\b/.test(text);
    const inputSpecifiesSata = /\bsata\b/.test(text);
    const inputSpecifiesSsd = /\b(ssd|nvme)\b/.test(text);
    const inputSpecifiesHdd = /\bhdd\b/.test(text) && !inputSpecifiesSsd;
    const partIsNvme = /\b(nvme|m2)\b/.test(partText);
    const partIsSata = /\bsata\b/.test(partText);
    const partIsSsd = /\b(ssd|nvme)\b/.test(partText);
    const partIsHdd = /\bhdd\b/.test(partText);
    if (inputSpecifiesSsd) {
      if (partIsSsd) score += 0.12;
      if (partIsHdd) score -= 0.25;
    } else if (inputSpecifiesHdd) {
      if (partIsHdd) score += 0.18;
      if (partIsSsd) score -= 0.3;
    }
    if (inputSpecifiesNvme) {
      if (partIsNvme) score += 0.24;
      else if (partIsSsd) score -= 0.34;
    }
    if (inputSpecifiesSata) {
      if (partIsSata) score += 0.2;
      else if (partIsSsd) score -= 0.24;
    }

    for (const modifier of ["ti", "super"]) {
      const inputHasModifier = new RegExp(`\\b${modifier}\\b`).test(text);
      const partHasModifier = new RegExp(`\\b${modifier}\\b`).test(partText);
      if (partHasModifier && !inputHasModifier) score -= 0.28;
      if (inputHasModifier && !partHasModifier) score -= 0.22;
    }

    if (/\b2x\d+gb\b/.test(partText) && !/\b2x\d+gb\b/.test(text)) score -= 0.06;
    if (/rtx 3060 12gb/.test(partText) && /\brtx ?3060\b/.test(text) && !/\b[68]gb\b/.test(text)) score += 0.05;

    return Math.max(0, Math.min(0.99, score));
  }

  function rankCandidates(source, category = null, limit = 6) {
    return parts
      .filter((part) => !category || part.category === category)
      .map((part) => ({ part, score: scoreCandidate(part, source, category) }))
      .sort((a, b) => b.score - a.score || b.part.name.length - a.part.name.length)
      .slice(0, limit);
  }

  function splitSegments(description) {
    const base = description
      .replace(/\r/g, "")
      .split(/\n|[;|•]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    return base.length ? base : [description.trim()].filter(Boolean);
  }

  function makeMatch(result, segment, category) {
    return {
      uid: `match-${++uidCounter}`,
      partId: result.part.id,
      category,
      segment,
      matchScore: result.score,
      alternatives: rankCandidates(segment, category, 8).map(({ part }) => part.id),
    };
  }

  function storageIdentity(part, segment) {
    const segmentText = normalize(segment);
    const combinedText = normalize(`${segment} ${part?.name ?? ""}`);
    const capacity = combinedText.match(/\b\d+(?:gb|tb)\b/)?.[0] ?? "";
    const type = /\bhdd\b/.test(combinedText) && !/\b(ssd|nvme)\b/.test(combinedText)
      ? "hdd"
      : /\b(ssd|nvme)\b/.test(combinedText)
        ? "ssd"
        : /\b(blu-ray|dvd)\b/.test(combinedText)
          ? "optical"
          : "";
    const models = usefulTokens(segmentText).filter((token) => {
      if (/^\d+(?:gb|tb|mhz|w)$/.test(token)) return false;
      return /[a-z]\d|\d[a-z]/.test(token) || /^\d{3,}$/.test(token);
    });

    return { capacity, type, models };
  }

  function isLikelyDuplicateStorage(existing, result, segment) {
    if (existing.partId === result.part.id) return true;
    if (normalize(existing.segment) === normalize(segment)) return true;

    const existingPart = byId.get(existing.partId);
    const left = storageIdentity(existingPart, existing.segment);
    const right = storageIdentity(result.part, segment);
    if (!left.capacity || left.capacity !== right.capacity || !left.type || left.type !== right.type) {
      return false;
    }

    if (left.models.length && right.models.length) {
      return left.models.some((model) => right.models.includes(model));
    }

    return true;
  }

  function analyseDescription(description) {
    const matches = [];
    const segments = splitSegments(description);

    for (const segment of segments) {
      const categories = detectCategories(segment);
      for (const category of categories) {
        const ranked = rankCandidates(segment, category, 8);
        const best = ranked[0];
        if (!best || best.score < 0.34) continue;

        if (category === "storage") {
          const duplicate = matches.find((match) => (
            match.category === "storage" && isLikelyDuplicateStorage(match, best, segment)
          ));
          if (!duplicate) {
            matches.push(makeMatch(best, segment, category));
          } else if (best.score > duplicate.matchScore) {
            Object.assign(duplicate, makeMatch(best, segment, category), { uid: duplicate.uid });
          }
          continue;
        }

        const existing = matches.find((match) => match.category === category);
        if (!existing) {
          matches.push(makeMatch(best, segment, category));
        } else if (best.score > existing.matchScore) {
          Object.assign(existing, makeMatch(best, segment, category), { uid: existing.uid });
        }
      }
    }

    if (!matches.length && description.trim()) {
      const broad = rankCandidates(description, null, 4).filter((result) => result.score >= 0.45);
      for (const result of broad) matches.push(makeMatch(result, description, result.part.category));
    }

    return matches;
  }

  function identificationConfidence(match) {
    const value = match.matchScore;
    if (value >= 0.8) return { label: "High", className: "high", value };
    if (value >= 0.58) return { label: "Medium", className: "medium", value };
    return { label: "Low", className: "low", value };
  }

  function formatGBP(value) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function roundFive(value) {
    return Math.round(value / 5) * 5;
  }

  function normalisedSellerPrice(sale) {
    if (Number.isFinite(sale?.itemPrice)) return sale.itemPrice;
    if (Number.isFinite(sale?.checkoutTotal) && Number.isFinite(sale?.buyerProtectionFee)) {
      return sale.checkoutTotal - sale.buyerProtectionFee;
    }
    return null;
  }

  function saleAgeDays(sale) {
    if (!sale?.soldDate || !marketSales.referenceDate) return null;
    const sold = Date.parse(`${sale.soldDate}T00:00:00Z`);
    const reference = Date.parse(`${marketSales.referenceDate}T00:00:00Z`);
    return Number.isFinite(sold) && Number.isFinite(reference)
      ? Math.max(0, (reference - sold) / 86_400_000)
      : null;
  }

  function eligibleExactSale(sale, maxAgeDays = 90) {
    const age = saleAgeDays(sale);
    return sale?.priceType === "exact"
      && sale.bestOfferAccepted !== true
      && sale.condition !== "faulty"
      && sale.condition !== "parts-only"
      && Number.isFinite(normalisedSellerPrice(sale))
      && age !== null
      && age <= maxAgeDays;
  }

  function weightedQuantile(samples, quantile) {
    if (!samples.length) return null;
    const ordered = [...samples].sort((a, b) => a.value - b.value);
    const target = ordered.reduce((sum, sample) => sum + sample.weight, 0) * quantile;
    let cumulative = 0;
    for (const sample of ordered) {
      cumulative += sample.weight;
      if (cumulative >= target) return sample.value;
    }
    return ordered.at(-1).value;
  }

  function recentComponentRange(part) {
    let samples = (marketSales.components ?? [])
      .filter((sale) => sale.partId === part.id && eligibleExactSale(sale))
      .filter((sale) => sale.sellerType === "private")
      .map((sale) => {
        const halfLife = ["gpu", "ram", "storage"].includes(part.category) ? 28 : 45;
        return {
          value: normalisedSellerPrice(sale),
          weight: Math.exp((-Math.LN2 * saleAgeDays(sale)) / halfLife),
        };
      });

    if (samples.length < 3) return null;
    if (samples.length >= 5) {
      const lowerFence = weightedQuantile(samples, 0.1);
      const upperFence = weightedQuantile(samples, 0.9);
      samples = samples.map((sample) => ({
        ...sample,
        value: Math.min(upperFence, Math.max(lowerFence, sample.value)),
      }));
    }

    return {
      low: weightedQuantile(samples, 0.25),
      mid: weightedQuantile(samples, 0.5),
      high: weightedQuantile(samples, 0.75),
      confidence: samples.length >= 5 ? "high" : "medium",
      source: "recent weighted UK sales",
    };
  }

  function partValuation(part) {
    const recent = recentComponentRange(part);
    if (recent) return recent;

    const price = Number(part?.price) || 0;
    let low = Number.isFinite(part?.priceLow) ? part.priceLow : null;
    let high = Number.isFinite(part?.priceHigh) ? part.priceHigh : null;

    if (low === null || high === null) {
      let spread = { high: 0.08, medium: 0.16, low: 0.3 }[part?.confidence] ?? 0.2;
      if (/configuration unknown|model and wattage unknown|unknown functional/i.test(part?.name ?? "")) {
        spread = Math.max(spread, 0.28);
      }
      low = roundFive(Math.max(0, price * (1 - spread)));
      high = roundFive(price * (1 + spread));
    }

    const mid = Number.isFinite(part?.price) ? part.price : (low + high) / 2;
    const relativeSpread = mid ? (high - low) / mid : 1;
    const confidence = part?.valuationConfidence
      ?? (relativeSpread <= 0.16 ? "high" : relativeSpread <= 0.45 ? "medium" : "low");

    return { low, mid, high, confidence, source: part?.evidenceNote ?? "catalogue range" };
  }

  function formatRange(range) {
    if (!range) return "£0";
    const low = Math.round(range.low);
    const high = Math.round(range.high);
    return low === high ? formatGBP(low) : `${formatGBP(low)}–${formatGBP(high)}`;
  }

  const UNKNOWN_ALLOWANCES = {
    case: { key: "case", label: "Unknown functional case", low: 20, high: 40 },
    psu: { key: "psu", label: "Unknown functional PSU", low: 15, high: 30, risk: true },
    cooler: { key: "cooler", label: "Unknown CPU cooler", low: 10, high: 20 },
    accessories: { key: "accessories", label: "Fans / Wi-Fi accessory", low: 5, high: 15 },
  };

  function looksLikeCompleteDesktop(matches, description) {
    if (/\b(parts only|components only|bundle only|not a complete pc)\b/.test(normalize(description))) return false;
    const found = new Set(matches.map((match) => match.category));
    const coreCount = ["cpu", "gpu", "motherboard", "ram", "storage"]
      .filter((category) => found.has(category)).length;
    return coreCount >= 4;
  }

  function unknownAllowances() {
    if (!looksLikeCompleteDesktop(state.matches, state.description)) return [];
    const found = new Set(state.matches.map((match) => match.category));
    const text = normalize(state.description);
    const allowances = [];

    for (const key of ["case", "psu", "cooler"]) {
      if (!found.has(key)) allowances.push(UNKNOWN_ALLOWANCES[key]);
    }

    if (/\b(case fans?|extra fans?|wifi (?:card|adapter|dongle)|wireless (?:card|adapter))\b/.test(text)) {
      allowances.push(UNKNOWN_ALLOWANCES.accessories);
    }

    return allowances;
  }

  function conditionProfile(completeMid, allowances) {
    const text = normalize(state.description);
    let fairFactor = completeMid < 400 ? 0.97 : completeMid < 900 ? 0.95 : 0.91;
    const notes = [];
    let riskSpread = 0;

    const gpu = state.matches
      .filter((match) => match.category === "gpu")
      .map((match) => normalize(byId.get(match.partId)?.name ?? ""))
      .join(" ");
    if (/\b(rtx 40|rtx 50|rx 7\d{3}|rx 9\d{3})/.test(gpu)) fairFactor += 0.01;
    if (/\b(b450|x470|am4|z370|z390)\b/.test(text)) fairFactor -= 0.01;
    fairFactor -= Math.min(0.025, allowances.length * 0.005);

    if (/\b(warranty|guarantee)\b/.test(text)) {
      fairFactor += 0.015;
      notes.push("warranty mentioned");
    }
    if (/\b(clean|cleaned|tested|benchmarked|documented)\b/.test(text)) {
      fairFactor += 0.015;
      notes.push("condition evidence mentioned");
    }
    if (/\b(dust|dusty|dirty|scratched|damage)\b/.test(text)) {
      fairFactor -= 0.035;
      riskSpread += 12;
      notes.push("cosmetic condition risk");
    }
    if (/\b(untested|no power|faulty|for parts|spares or repair)\b/.test(text)) {
      fairFactor -= 0.12;
      riskSpread += 30;
      notes.push("functional uncertainty");
    }
    if (/\b(zero feedback|0 feedback|new seller)\b/.test(text)) {
      fairFactor -= 0.025;
      riskSpread += 10;
      notes.push("seller-history risk");
    }

    return {
      fairFactor: Math.max(0.72, Math.min(0.99, fairFactor)),
      quickDiscount: 0.1 + Math.min(0.04, allowances.length * 0.008),
      cleanPremium: 0.075,
      riskSpread,
      notes,
    };
  }

  function comparableScore(sale) {
    const selected = new Map(state.matches.map((match) => [match.category, byId.get(match.partId)]));
    const cpu = normalize(selected.get("cpu")?.name ?? "");
    const gpu = normalize(selected.get("gpu")?.name ?? "");
    const ram = normalize(selected.get("ram")?.name ?? "");
    const storage = normalize(selected.get("storage")?.name ?? "");
    let score = 0;

    if (cpu && sale.cpu && (cpu.includes(normalize(sale.cpu)) || normalize(sale.cpu).includes(cpu))) score += 0.35;
    if (gpu && sale.gpu && (gpu.includes(normalize(sale.gpu)) || normalize(sale.gpu).includes(gpu))) score += 0.4;
    if (sale.ramGb && ram.includes(`${sale.ramGb}gb`)) score += 0.12;
    if (sale.storageGb && storage.includes(sale.storageGb >= 1000 ? `${sale.storageGb / 1000}tb` : `${sale.storageGb}gb`)) score += 0.08;
    return score;
  }

  function systemComparables() {
    const close = (marketSales.systems ?? [])
      .map((sale) => ({ sale, score: comparableScore(sale) }))
      .filter((item) => item.score >= 0.7);
    const exact = close
      .filter(({ sale }) => eligibleExactSale(sale))
      .map(({ sale, score }) => ({
        value: normalisedSellerPrice(sale),
        weight: score * Math.exp((-Math.LN2 * saleAgeDays(sale)) / 45),
      }));
    const censored = close.filter(({ sale }) => sale.priceType === "upper-bound" || sale.bestOfferAccepted === true);
    return { exact, censored };
  }

  function makeBand(mid, halfWidth) {
    return {
      low: Math.max(0, roundFive(mid - halfWidth)),
      mid: roundFive(mid),
      high: roundFive(mid + halfWidth),
    };
  }

  function calculateValuation() {
    const partDetails = state.matches
      .map((match) => ({ match, part: byId.get(match.partId) }))
      .filter(({ part }) => Boolean(part))
      .map(({ match, part }) => ({ match, part, valuation: partValuation(part) }));
    const componentMid = partDetails.reduce((sum, item) => sum + item.valuation.mid, 0);
    const componentUncertainty = Math.sqrt(partDetails.reduce((sum, item) => (
      sum + ((item.valuation.high - item.valuation.low) / 2) ** 2
    ), 0));

    const allowances = unknownAllowances();
    const allowanceLow = allowances.reduce((sum, item) => sum + item.low, 0);
    const allowanceHigh = allowances.reduce((sum, item) => sum + item.high, 0);
    const allowanceMid = (allowanceLow + allowanceHigh) / 2;
    const completeLow = Math.max(0, componentMid + allowanceLow - componentUncertainty * 0.35);
    const completeHigh = componentMid + allowanceHigh + componentUncertainty * 0.35;
    const completeMid = (completeLow + completeHigh) / 2;
    const profile = conditionProfile(completeMid, allowances);
    const baseHalfWidth = Math.max(
      15,
      componentUncertainty * 0.55 + allowances.length * 2.5 + profile.riskSpread,
    );

    let quick = makeBand(
      completeMid * Math.max(0.65, profile.fairFactor - profile.quickDiscount),
      baseHalfWidth * 0.9,
    );
    let fair = makeBand(completeMid * profile.fairFactor, baseHalfWidth);
    let clean = makeBand(
      completeMid * Math.min(1.02, profile.fairFactor + profile.cleanPremium),
      baseHalfWidth * 0.75,
    );

    const comparables = systemComparables();
    let method;
    if (comparables.exact.length >= 2) {
      const comparableWeight = comparables.exact.length >= 5 ? 0.75 : 0.55;
      const partsWeight = 1 - comparableWeight;
      const comparableBands = {
        quick: weightedQuantile(comparables.exact, 0.25),
        fair: weightedQuantile(comparables.exact, 0.5),
        clean: weightedQuantile(comparables.exact, 0.75),
      };
      quick = makeBand(comparableBands.quick * comparableWeight + quick.mid * partsWeight, baseHalfWidth * 0.7);
      fair = makeBand(comparableBands.fair * comparableWeight + fair.mid * partsWeight, baseHalfWidth * 0.7);
      clean = makeBand(comparableBands.clean * comparableWeight + clean.mid * partsWeight, baseHalfWidth * 0.7);
      method = `${comparables.exact.length} close, uncensored whole-PC sales blended with adjusted parts value.`;
    } else {
      const censoredCopy = comparables.censored.length
        ? ` ${comparables.censored.length} close Best Offer/upper-bound comp was excluded from the median.`
        : "";
      method = `Fewer than 2 usable whole-PC comparables; dynamic bundle fallback used.${censoredCopy}`;
    }

    return {
      partDetails,
      componentMid,
      componentUncertainty,
      allowances,
      allowanceLow,
      allowanceHigh,
      completeParts: { low: completeLow, mid: completeMid, high: completeHigh },
      quick,
      fair,
      clean,
      method,
      conditionNotes: profile.notes,
      exactComparableCount: comparables.exact.length,
      censoredComparableCount: comparables.censored.length,
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPartRow(match) {
    const selected = byId.get(match.partId);
    const category = CATEGORY_META[match.category];
    const identification = identificationConfidence(match);
    const valuation = partValuation(selected);
    const options = [...new Set([match.partId, ...match.alternatives])]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((part) => `<option value="${part.id}" ${part.id === selected.id ? "selected" : ""}>${escapeHtml(part.name)} — ${formatRange(partValuation(part))}</option>`)
      .join("");

    return `
      <div class="part-row" data-match-id="${match.uid}">
        <span class="category-icon" aria-hidden="true">${category.short}</span>
        <span class="part-category">${category.label}</span>
        <div class="part-selection">
          <label class="sr-only" for="select-${match.uid}">Matched ${category.label}</label>
          <select id="select-${match.uid}" data-action="change-part">${options}</select>
          <div class="match-meta">
            <span class="match-pill ${identification.className}">Identification: ${identification.label}</span>
            <span class="match-pill ${valuation.confidence}">Value: ${valuation.confidence[0].toUpperCase()}${valuation.confidence.slice(1)}</span>
            <span title="${escapeHtml(match.segment)}">from “${escapeHtml(match.segment.slice(0, 48))}${match.segment.length > 48 ? "…" : ""}”</span>
          </div>
        </div>
        <strong class="part-price">${formatRange(valuation)}</strong>
        <button class="remove-button" type="button" data-action="remove-part" aria-label="Remove ${escapeHtml(selected.name)}">×</button>
      </div>`;
  }

  function warningMarkup(kind, title, copy) {
    return `
      <div class="warning-item ${kind === "good" ? "good" : ""}">
        <span class="warning-icon" aria-hidden="true">${kind === "good" ? "✓" : "!"}</span>
        <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div>
      </div>`;
  }

  function buildWarnings(valuation) {
    const found = new Set(state.matches.map((match) => match.category));
    const allowanceKeys = new Set(valuation.allowances.map((item) => item.key));
    const missing = Object.entries(CATEGORY_META)
      .filter(([key, meta]) => meta.required && !found.has(key) && !allowanceKeys.has(key))
      .map(([, meta]) => meta.label);
    const lowIdentification = state.matches.filter((match) => identificationConfidence(match).className === "low");
    const lowValuation = valuation.partDetails.filter((item) => item.valuation.confidence === "low");
    const text = normalize(state.description);
    const warnings = [];

    if (valuation.allowances.length) {
      const allowanceCopy = valuation.allowances
        .map((item) => `${item.label} ${formatRange(item)}`)
        .join(", ");
      warnings.push(warningMarkup(
        "warning",
        "Conservative essentials added",
        `${allowanceCopy}. These add modest value but widen uncertainty.`,
      ));
    }

    if (missing.length) {
      warnings.push(warningMarkup("warning", "Still unpriced", `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no safe automatic allowance.`));
    } else if (!valuation.allowances.length) {
      warnings.push(warningMarkup("good", "Core specification covered", "Every essential pricing category was detected."));
    }

    if (lowIdentification.length) {
      warnings.push(warningMarkup("warning", "Weak identification to review", `${lowIdentification.length} component ${lowIdentification.length === 1 ? "has" : "have"} low identification confidence.`));
    }

    if (lowValuation.length) {
      warnings.push(warningMarkup("warning", "Wide price uncertainty", `${lowValuation.length} identified component ${lowValuation.length === 1 ? "has" : "have"} low valuation confidence.`));
    }

    if (/rtx 5060 ti 16gb/.test(text) && !/\bti\b/.test(normalize(state.description))) {
      warnings.push(warningMarkup("warning", "Interpreted RTX 5060 16GB", "This was treated as RTX 5060 Ti 16GB; confirm the Ti label."));
    }

    if (/corsair/.test(text) && /\b(psu|power supply)\b/.test(text) && !/\b\d{3,4}w\b/.test(text)) {
      warnings.push(warningMarkup("warning", "PSU wattage missing", "A modest value range is included, but the unknown model increases buyer risk."));
    }

    if (state.matches.some((match) => /interface unknown/.test(byId.get(match.partId)?.name ?? ""))) {
      warnings.push(warningMarkup("warning", "SSD interface missing", "NVMe and SATA drives have different values."));
    }

    for (const note of valuation.conditionNotes) {
      warnings.push(warningMarkup("warning", "Sale-context adjustment", `${note[0].toUpperCase()}${note.slice(1)} affects the sale range, not the intrinsic hardware subtotal.`));
    }

    if (valuation.censoredComparableCount) {
      warnings.push(warningMarkup(
        "warning",
        "Best Offer evidence treated cautiously",
        `${valuation.censoredComparableCount} close whole-PC listing is stored as an upper bound and excluded from the median.`,
      ));
    }

    if (!warnings.length) warnings.push(warningMarkup("good", "Ready to price", "No obvious identification problems were found."));
    return warnings.join("");
  }

  function render() {
    const valuation = calculateValuation();
    const identificationValues = state.matches.map((match) => identificationConfidence(match).value);
    const averageIdentification = identificationValues.length
      ? identificationValues.reduce((sum, value) => sum + value, 0) / identificationValues.length
      : 0;
    const valuationRanks = { high: 3, medium: 2, low: 1 };
    const averageValuation = valuation.partDetails.length
      ? valuation.partDetails.reduce((sum, item) => sum + valuationRanks[item.valuation.confidence], 0) / valuation.partDetails.length
      : 0;

    elements.emptyState.hidden = true;
    elements.resultsContent.hidden = false;
    elements.partsList.innerHTML = state.matches.map(renderPartRow).join("");
    elements.partsTotal.textContent = formatGBP(roundFive(valuation.componentMid));
    elements.allowanceValue.textContent = valuation.allowances.length
      ? formatRange({ low: valuation.allowanceLow, high: valuation.allowanceHigh })
      : "£0";
    elements.allowanceSummary.textContent = valuation.allowances.length
      ? `${valuation.allowances.length} conservative ${valuation.allowances.length === 1 ? "allowance" : "allowances"}`
      : "No automatic allowances";
    elements.completePartsValue.textContent = formatRange(valuation.completeParts);
    elements.quickValue.textContent = formatRange(valuation.quick);
    elements.fairValue.textContent = formatRange(valuation.fair);
    elements.cleanValue.textContent = formatRange(valuation.clean);
    elements.matchCount.textContent = `${state.matches.length} ${state.matches.length === 1 ? "part" : "parts"}`;
    elements.matchSummary.textContent = state.matches.length
      ? `Found ${state.matches.length} priced ${state.matches.length === 1 ? "component" : "components"}${valuation.allowances.length ? ` plus ${valuation.allowances.length} essential ${valuation.allowances.length === 1 ? "allowance" : "allowances"}` : ""}.`
      : "No reliable component matches were found.";
    elements.warningsList.innerHTML = buildWarnings(valuation);
    elements.valuationMethod.textContent = `${valuation.method} Seller/item prices exclude Buyer Protection and delivery.`;

    if (averageIdentification >= 0.84 && averageValuation >= 2.6 && !valuation.allowances.length) {
      elements.overallConfidence.textContent = "High confidence";
      elements.overallConfidenceDot.style.background = "#d9f878";
    } else if (averageIdentification >= 0.66 && averageValuation >= 1.8) {
      elements.overallConfidence.textContent = "Medium confidence";
      elements.overallConfidenceDot.style.background = "#f0ad4e";
    } else {
      elements.overallConfidence.textContent = "Low confidence";
      elements.overallConfidenceDot.style.background = "#e47b6b";
    }
  }

  function runValuation({ scroll = true } = {}) {
    const description = elements.description.value.trim();
    if (!description) {
      elements.description.focus();
      elements.description.setAttribute("aria-invalid", "true");
      return;
    }

    elements.description.removeAttribute("aria-invalid");
    state.description = description;
    state.matches = analyseDescription(description);
    render();
    if (scroll) elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearAll() {
    state.description = "";
    state.matches = [];
    elements.description.value = "";
    elements.resultsContent.hidden = true;
    elements.emptyState.hidden = false;
    elements.manualSearch.value = "";
    elements.description.focus();
  }

  elements.valueButton.addEventListener("click", () => runValuation());
  elements.clearButton.addEventListener("click", clearAll);
  elements.exampleButton.addEventListener("click", () => {
    elements.description.value = exampleText;
    runValuation({ scroll: false });
  });
  elements.editDescriptionButton.addEventListener("click", () => {
    elements.description.focus();
    window.scrollTo({ top: elements.description.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
  });

  elements.description.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runValuation();
  });

  elements.partsList.addEventListener("change", (event) => {
    const select = event.target.closest("[data-action='change-part']");
    if (!select) return;
    const row = select.closest("[data-match-id]");
    const match = state.matches.find((item) => item.uid === row?.dataset.matchId);
    if (!match) return;
    match.partId = select.value;
    match.matchScore = Math.max(match.matchScore, 0.72);
    render();
  });

  elements.partsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-part']");
    if (!button) return;
    const row = button.closest("[data-match-id]");
    state.matches = state.matches.filter((item) => item.uid !== row?.dataset.matchId);
    render();
  });

  elements.addPartButton.addEventListener("click", () => {
    const query = elements.manualSearch.value.trim();
    if (!query) {
      elements.manualSearch.focus();
      return;
    }
    const best = rankCandidates(query, null, 1)[0];
    if (!best || best.score < 0.24) return;

    const duplicate = best.part.category === "storage"
      ? state.matches.find((match) => match.category === "storage" && isLikelyDuplicateStorage(match, best, query))
      : state.matches.find((match) => match.category === best.part.category || match.partId === best.part.id);
    if (duplicate) {
      elements.manualSearch.value = "";
      return;
    }

    state.matches.push(makeMatch(best, query, best.part.category));
    elements.manualSearch.value = "";
    render();
  });

  elements.manualSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.addPartButton.click();
  });

  window.RigWorth = {
    analyseDescription,
    rankCandidates,
    estimateDescription: (description) => {
      const previousDescription = state.description;
      const previousMatches = state.matches;
      state.description = description;
      state.matches = analyseDescription(description);
      const estimate = {
        matches: state.matches.map((match) => ({ ...match, part: byId.get(match.partId) })),
        valuation: calculateValuation(),
      };
      state.description = previousDescription;
      state.matches = previousMatches;
      return estimate;
    },
    getState: () => ({
      description: state.description,
      matches: state.matches.map((match) => ({ ...match, part: byId.get(match.partId) })),
      valuation: calculateValuation(),
    }),
    parts,
  };
})();
