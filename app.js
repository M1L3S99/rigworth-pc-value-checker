(() => {
  "use strict";

  const parts = Array.isArray(window.PC_PARTS) ? window.PC_PARTS : [];
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
    quickValue: document.querySelector("#quickValue"),
    fairValue: document.querySelector("#fairValue"),
    cleanValue: document.querySelector("#cleanValue"),
    matchCount: document.querySelector("#matchCount"),
    matchSummary: document.querySelector("#matchSummary"),
    overallConfidence: document.querySelector("#overallConfidence"),
    overallConfidenceDot: document.querySelector("#overallConfidenceDot"),
    warningsList: document.querySelector("#warningsList"),
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
    cooler: { label: "Cooling", short: "COOL", required: false },
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

    const inputSpecifiesSsd = /\b(ssd|nvme)\b/.test(text);
    const inputSpecifiesHdd = /\bhdd\b/.test(text) && !inputSpecifiesSsd;
    const partIsSsd = /\b(ssd|nvme)\b/.test(partText);
    const partIsHdd = /\bhdd\b/.test(partText);
    if (inputSpecifiesSsd) {
      if (partIsSsd) score += 0.12;
      if (partIsHdd) score -= 0.25;
    } else if (inputSpecifiesHdd) {
      if (partIsHdd) score += 0.18;
      if (partIsSsd) score -= 0.3;
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

  function matchConfidence(match) {
    const part = byId.get(match.partId);
    const sourceWeight = { high: 0.98, medium: 0.82, low: 0.62 }[part?.confidence] ?? 0.7;
    const combined = match.matchScore * 0.65 + sourceWeight * 0.35;
    if (combined >= 0.84) return { label: "High", className: "high", value: combined };
    if (combined >= 0.66) return { label: "Medium", className: "medium", value: combined };
    return { label: "Low", className: "low", value: combined };
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
    const confidence = matchConfidence(match);
    const options = [...new Set([match.partId, ...match.alternatives])]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((part) => `<option value="${part.id}" ${part.id === selected.id ? "selected" : ""}>${escapeHtml(part.name)} — ${formatGBP(part.price)}</option>`)
      .join("");

    return `
      <div class="part-row" data-match-id="${match.uid}">
        <span class="category-icon" aria-hidden="true">${category.short}</span>
        <span class="part-category">${category.label}</span>
        <div class="part-selection">
          <label class="sr-only" for="select-${match.uid}">Matched ${category.label}</label>
          <select id="select-${match.uid}" data-action="change-part">${options}</select>
          <div class="match-meta">
            <span class="match-pill ${confidence.className}">${confidence.label} match</span>
            <span title="${escapeHtml(match.segment)}">from “${escapeHtml(match.segment.slice(0, 48))}${match.segment.length > 48 ? "…" : ""}”</span>
          </div>
        </div>
        <strong class="part-price">${formatGBP(selected.price)}</strong>
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

  function buildWarnings() {
    const found = new Set(state.matches.map((match) => match.category));
    const missing = Object.entries(CATEGORY_META)
      .filter(([key, meta]) => meta.required && !found.has(key))
      .map(([, meta]) => meta.label);
    const lowMatches = state.matches.filter((match) => matchConfidence(match).className === "low");
    const text = normalize(state.description);
    const warnings = [];

    if (missing.length) {
      warnings.push(warningMarkup("warning", "Missing from description", `${missing.join(", ")} ${missing.length === 1 ? "was" : "were"} not priced.`));
    } else {
      warnings.push(warningMarkup("good", "Core specification covered", "Every essential pricing category was detected."));
    }

    if (lowMatches.length) {
      warnings.push(warningMarkup("warning", "Weak match to review", `${lowMatches.length} component ${lowMatches.length === 1 ? "uses" : "use"} a low-confidence estimate.`));
    }

    if (/rtx 5060 ti 16gb/.test(text) && !/\bti\b/.test(normalize(state.description))) {
      warnings.push(warningMarkup("warning", "Interpreted RTX 5060 16GB", "This was treated as RTX 5060 Ti 16GB; confirm the Ti label."));
    }

    if (/corsair/.test(text) && /\b(psu|power supply)\b/.test(text) && !/\b\d{3,4}w\b/.test(text)) {
      warnings.push(warningMarkup("warning", "PSU wattage missing", "A low-confidence Corsair fallback value was used."));
    }

    if (state.matches.some((match) => /interface unknown/.test(byId.get(match.partId)?.name ?? ""))) {
      warnings.push(warningMarkup("warning", "SSD interface missing", "NVMe and SATA drives have different values."));
    }

    if (!warnings.length) warnings.push(warningMarkup("good", "Ready to price", "No obvious identification problems were found."));
    return warnings.join("");
  }

  function render() {
    const activeParts = state.matches.map((match) => byId.get(match.partId)).filter(Boolean);
    const total = activeParts.reduce((sum, part) => sum + part.price, 0);
    const confidenceValues = state.matches.map((match) => matchConfidence(match).value);
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;

    elements.emptyState.hidden = true;
    elements.resultsContent.hidden = false;
    elements.partsList.innerHTML = state.matches.map(renderPartRow).join("");
    elements.partsTotal.textContent = formatGBP(total);
    elements.quickValue.textContent = formatGBP(roundFive(total * 0.85));
    elements.fairValue.textContent = formatGBP(roundFive(total * 0.95));
    elements.cleanValue.textContent = formatGBP(roundFive(total * 1.05));
    elements.matchCount.textContent = `${state.matches.length} ${state.matches.length === 1 ? "part" : "parts"}`;
    elements.matchSummary.textContent = state.matches.length
      ? `Found ${state.matches.length} priced ${state.matches.length === 1 ? "component" : "components"}. Check the dropdowns before using the total.`
      : "No reliable component matches were found.";
    elements.warningsList.innerHTML = buildWarnings();

    if (averageConfidence >= 0.84) {
      elements.overallConfidence.textContent = "Strong match coverage";
      elements.overallConfidenceDot.style.background = "#d9f878";
    } else if (averageConfidence >= 0.66) {
      elements.overallConfidence.textContent = "Review suggested";
      elements.overallConfidenceDot.style.background = "#f0ad4e";
    } else {
      elements.overallConfidence.textContent = "Low-confidence estimate";
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
    getState: () => ({
      description: state.description,
      matches: state.matches.map((match) => ({ ...match, part: byId.get(match.partId) })),
    }),
    parts,
  };
})();
