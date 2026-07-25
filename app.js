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
    percentileSummary: document.querySelector("#percentileSummary"),
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

  function detectCategories(segment) {
    const text = normalize(segment);
    const categories = [];
    const push = (category, condition) => {
      if (condition && !categories.includes(category)) categories.push(category);
    };

    push("cpu", /\b(cpu|processor|ryzen|threadripper|fx\d|a\d-\d|core i[3579]|i[3579][ -]?\d{4,5}(?:k|kf|f|s|t)?)\b/.test(text));
    push("gpu", /\b(gpu|graphics|video card|geforce|rtx(?:\s?\d{4})?|gtx(?:\s?\d{3,4})?|radeon|rx ?\d{3,4}|arc [ab]\d{3})\b/.test(text));
    push("motherboard", /\b(motherboard|mobo|mainboard|a320|b350|b450|b460|b550|b650|b660|b760|b850|x370|x470|x570|x670|x870|z77|z87|z97|z170|z270|z370|z390|z490|z590|z690|z790|z890|h61|h81|h110|h310|h410|h470|b360|b365|h370)\b/.test(text));
    push("ram", /\b(ram|memory|ddr[345]|dimm|sodimm)\b/.test(text));
    push("storage", /\b(storage|ssd|hdd|nvme|m2|hard drive|hard disk|barracuda|ironwolf|sn\d{3,4}|evo|mx500)\b/.test(text));
    push("psu", /\b(psu|power supply|corsair (?:cv|cx|rm|sf)|seasonic focus|evga supernova|pure power|system power|mwe|a650bn|a750gl)\b/.test(text));
    push("case", /\b(case|chassis|4000d|5000d|meshify|fractal north|o11|nr200|h510|h5 flow|air 903)\b/.test(text));
    push("cooler", /\b(cooler|heatsink|aio|hyper 212|nh-d15|nh-u12|peerless assassin|phantom spirit|liquid freezer|h100i|kraken)\b/.test(text));
    return categories;
  }

  const NUMBER_WORDS = new Map([
    ["one", 1], ["two", 2], ["three", 3], ["four", 4],
    ["five", 5], ["six", 6], ["seven", 7], ["eight", 8],
  ]);

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NUMBER_WORDS.get(String(value).toLowerCase()) ?? null;
  }

  function capacityToGb(amount, unit) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return null;
    return /^t/i.test(unit) ? numeric * 1000 : numeric;
  }

  function displayCapacity(capacityGb) {
    return capacityGb >= 1000 && capacityGb % 1000 === 0
      ? `${capacityGb / 1000}TB`
      : `${capacityGb}GB`;
  }

  function manufacturerFor(text, category) {
    const value = normalize(text);
    if (category === "cpu") {
      if (/\b(amd|ryzen|threadripper)\b/.test(value)) return "amd";
      if (/\b(intel|core i[3579]|core ultra|i[3579][ -]?\d{4,5})\b/.test(value)) return "intel";
    }
    if (category === "gpu") {
      if (/\b(nvidia|geforce|rtx|gtx)\b/.test(value)) return "nvidia";
      if (/\b(amd|radeon|rx ?\d{3,4})\b/.test(value)) return "amd";
      if (/\b(intel|arc [ab]\d{3})\b/.test(value)) return "intel";
    }
    if (category === "storage") {
      if (/\b(wd|western digital)\b/.test(value)) return "western digital";
      if (/\bsamsung\b/.test(value)) return "samsung";
      if (/\bcrucial\b/.test(value)) return "crucial";
      if (/\bkingston\b/.test(value)) return "kingston";
      if (/\bseagate\b/.test(value)) return "seagate";
      if (/\btoshiba\b/.test(value)) return "toshiba";
    }
    if (category === "motherboard") {
      return value.match(/\b(msi|asus|gigabyte|asrock|biostar|intel)\b/)?.[1] ?? null;
    }
    if (category === "psu") {
      return value.match(/\b(corsair|seasonic|evga|be quiet|cooler master|thermaltake|antec|silverstone|msi)\b/)?.[1] ?? null;
    }
    return null;
  }

  function parseProductIdentity(value, category, supplied = {}) {
    const text = normalize(value);
    const identity = {
      category,
      manufacturer: supplied.manufacturer && supplied.manufacturer !== "unknown"
        ? normalize(supplied.manufacturer)
        : manufacturerFor(text, category),
      family: supplied.family ? normalize(supplied.family) : null,
      modelNumber: supplied.modelNumber ? normalize(supplied.modelNumber) : null,
      variant: supplied.variant ? normalize(supplied.variant) : null,
      capacityGb: Number.isFinite(supplied.capacityGb) ? supplied.capacityGb : null,
      storageMedium: supplied.storageMedium ? normalize(supplied.storageMedium) : null,
      interface: supplied.interface ? normalize(supplied.interface) : null,
      wattage: Number.isFinite(supplied.wattage) ? supplied.wattage : null,
      speedMhz: Number.isFinite(supplied.speedMhz) ? supplied.speedMhz : null,
      formFactor: supplied.formFactor ? normalize(supplied.formFactor) : null,
      qualifiers: [],
    };

    if (category === "cpu") {
      const ryzen = text.match(/\bryzen\s+([3579])\s+(\d{4,5}(?:x3d|xt|x|g)?)\b/);
      const intel = text.match(/\bcore\s+(i[3579])[- ]?(\d{4,5}(?:k|kf|f|ks|s|t)?)\b/);
      const intelShort = text.match(/\b(i[3579])[- ]?(\d{4,5}(?:k|kf|f|ks|s|t)?)\b/);
      const ultra = text.match(/\bcore\s+ultra\s+([3579])\s+(\d{3}[a-z]?)\b/);
      if (ryzen) {
        identity.family ??= `ryzen ${ryzen[1]}`;
        identity.modelNumber ??= ryzen[2];
      } else if (intel) {
        identity.family ??= `core ${intel[1]}`;
        identity.modelNumber ??= intel[2];
      } else if (intelShort) {
        identity.family ??= `core ${intelShort[1]}`;
        identity.modelNumber ??= intelShort[2];
      } else if (ultra) {
        identity.family ??= `core ultra ${ultra[1]}`;
        identity.modelNumber ??= ultra[2];
      }
    } else if (category === "gpu") {
      const geforce = text.match(/\b(rtx|gtx)\s*(\d{3,4})\s*(ti|super)?\b/);
      const radeon = text.match(/\brx\s*(\d{3,4})\s*(xt|xtx)?\b/);
      const arc = text.match(/\barc\s*([ab]\d{3})\b/);
      if (geforce) {
        identity.family ??= `geforce ${geforce[1]}`;
        identity.modelNumber ??= geforce[2];
        if (geforce[3]) identity.qualifiers.push(geforce[3]);
      } else if (radeon) {
        identity.family ??= "radeon rx";
        identity.modelNumber ??= radeon[1];
        if (radeon[2]) identity.qualifiers.push(radeon[2]);
      } else if (arc) {
        identity.family ??= "intel arc";
        identity.modelNumber ??= arc[1];
      }
      const vram = text.match(/\b(\d{1,2})gb\b/);
      if (vram && !identity.variant) identity.variant = `${vram[1]}gb`;
    } else if (category === "storage") {
      if (/\bgreen\b/.test(text)) identity.family ??= "green";
      identity.modelNumber ??= text.match(/\b(sn\d{3,4}|wds[a-z0-9]+|mx500|[0-9]{3,4}\s*evo)\b/)?.[1] ?? null;
      const capacity = text.match(/\b(\d+(?:\.\d+)?)(gb|tb)\b/);
      identity.capacityGb ??= capacity ? capacityToGb(capacity[1], capacity[2]) : null;
      if (!identity.storageMedium) {
        if (/\b(hdd)\b/.test(text) && !/\b(ssd|nvme)\b/.test(text)) identity.storageMedium = "hdd";
        else if (/\b(ssd|nvme)\b/.test(text)) identity.storageMedium = "ssd";
      }
      if (!identity.interface || identity.interface === "unknown") {
        if (/\b(nvme|pcie|gen[345])\b/.test(text)) identity.interface = "nvme";
        else if (/\bsata\b/.test(text)) identity.interface = "sata";
      }
      if (!identity.formFactor) {
        if (/\b2[.]5(?:-inch| inch)?\b/.test(text)) identity.formFactor = "2.5-inch";
        else if (/\bm2\b/.test(text)) identity.formFactor = "m.2";
      }
    } else if (category === "ram") {
      identity.family ??= text.match(/\bddr[345]\b/)?.[0] ?? null;
      const capacity = text.match(/\b(\d+)gb\b/);
      identity.capacityGb ??= capacity ? Number(capacity[1]) : null;
      const speed = text.match(/\b(\d{4,5})mhz\b/);
      identity.speedMhz ??= speed ? Number(speed[1]) : null;
    } else if (category === "motherboard") {
      identity.family ??= text.match(/\b(a320|b350|b450|b550|b650|b660|b760|b850|x370|x470|x570|x670|x870|z\d{2,3}|h\d{2,3})\b/)?.[1] ?? null;
    } else if (category === "psu") {
      const wattage = text.match(/\b(\d{3,4})w\b/);
      identity.wattage ??= wattage ? Number(wattage[1]) : null;
    }

    return identity;
  }

  function parseRamDetails(source) {
    const text = source.toLowerCase();
    const patterns = [
      /\b(\d+|one|two|three|four|five|six|seven|eight)\s*(?:sticks?|modules?)\s*(?:of\s*)?(\d+)\s*gb\b/i,
      /\b(\d+|one|two|three|four|five|six|seven|eight)\s+(\d+)\s*gb\s*(?:sticks?|modules?)\b/i,
      /\b(\d+)\s*[x×]\s*(\d+)\s*gb\b/i,
    ];
    let quantity = null;
    let unitCapacity = null;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        quantity = numberValue(match[1]);
        unitCapacity = Number(match[2]);
        break;
      }
    }
    if (quantity === null) {
      const reversed = text.match(/\b(\d+)\s*gb\s*[x×]\s*(\d+)\b/i);
      if (reversed) {
        unitCapacity = Number(reversed[1]);
        quantity = Number(reversed[2]);
      }
    }
    const explicit = text.match(/\b(\d+)\s*gb\b/i);
    const totalCapacity = quantity !== null && unitCapacity !== null
      ? quantity * unitCapacity
      : explicit
        ? Number(explicit[1])
        : null;
    return {
      quantity,
      unitCapacity,
      totalCapacity,
      arithmetic: quantity !== null
        ? `${quantity} × ${unitCapacity}GB = ${totalCapacity}GB`
        : totalCapacity !== null
          ? `${totalCapacity}GB total; module configuration not stated`
          : "Capacity not stated",
    };
  }

  function makeEntity(componentType, sourceText, sourceStart, sourceEnd, extra = {}) {
    const entity = {
      componentType,
      manufacturer: null,
      productFamily: null,
      modelNumber: null,
      variant: null,
      capacity: null,
      unitCapacity: null,
      quantity: null,
      totalCapacity: null,
      storageMedium: null,
      interface: null,
      formFactor: null,
      wattage: null,
      speedMhz: null,
      qualifiers: [],
      sourceText,
      sourceStart,
      sourceEnd,
      containerStart: extra.containerStart ?? sourceStart,
      identificationConfidence: "low",
      parsedArithmetic: null,
      ...extra,
    };
    const identity = parseProductIdentity(sourceText, componentType, {
      manufacturer: entity.manufacturer,
      family: entity.productFamily,
      modelNumber: entity.modelNumber,
      variant: entity.variant,
      capacityGb: entity.totalCapacity ?? entity.capacity,
      storageMedium: entity.storageMedium,
      interface: entity.interface,
      formFactor: entity.formFactor,
      wattage: entity.wattage,
      speedMhz: entity.speedMhz,
    });
    entity.manufacturer = identity.manufacturer;
    entity.productFamily = identity.family;
    entity.modelNumber = identity.modelNumber;
    entity.variant = identity.variant;
    entity.capacity ??= identity.capacityGb;
    entity.totalCapacity ??= identity.capacityGb;
    entity.storageMedium ??= identity.storageMedium;
    entity.interface ??= identity.interface;
    entity.formFactor ??= identity.formFactor;
    entity.wattage ??= identity.wattage;
    entity.speedMhz ??= identity.speedMhz;
    entity.qualifiers = [...new Set([...entity.qualifiers, ...identity.qualifiers])];
    return entity;
  }

  function categorySpecificSpan(source, category, categoryCount) {
    if (categoryCount <= 1) return { text: source, index: 0 };
    const patterns = {
      cpu: /\b(?:(?:amd\s+)?ryzen\s+[3579]\s+\d{4,5}(?:x3d|xt|x|g)?|(?:intel\s+)?core\s+(?:i[3579][-\s]?\d{4,5}[a-z]*|ultra\s+[3579]\s+\d{3}[a-z]?))\b/i,
      gpu: /\b(?:(?:nvidia\s+)?(?:geforce\s+)?(?:rtx|gtx)\s*\d{3,4}(?:\s*(?:ti|super))?(?:\s+\d{1,2}\s*gb)?|(?:amd\s+)?(?:radeon\s+)?rx\s*\d{3,4}(?:\s*(?:xt|xtx))?)\b/i,
      ram: /\b(?:(?:\d+|one|two|three|four|five|six|seven|eight)\s*(?:sticks?|modules?)\s*(?:of\s*)?\d+\s*gb|\d+\s*[x×]\s*\d+\s*gb|\d+\s*gb\s*[x×]\s*\d+|\d+\s*gb)(?:\s+ddr[345])?(?:\s+(?:ram|memory))?\b/i,
      psu: /\b(?:(?:corsair|seasonic|evga|be quiet|cooler master|thermaltake|antec|silverstone|msi)\s+)?\d{3,4}\s*w(?:\s+(?:psu|power supply))?\b/i,
      motherboard: /\b(?:(?:msi|asus|gigabyte|asrock|biostar)\s+)?[abxhzb]\d{2,3}(?:\s+[\w-]+){0,4}\b/i,
      cooler: /\b(?:amd\s+wraith\s+\w+(?:\s+stock)?\s+cooler|[\w-]+\s+(?:cpu\s+)?cooler|aio)\b/i,
      case: /\b(?:nzxt\s+h\d{3}|corsair\s+[45]000d|[\w-]+\s+(?:pc\s+)?case|chassis)\b/i,
    };
    const match = source.match(patterns[category]);
    return match ? { text: match[0], index: match.index } : { text: source, index: 0 };
  }

  function extractComponentEntities(description) {
    const entities = [];
    const chunkPattern = /[^\n;|•]+/g;
    for (const chunkMatch of description.matchAll(chunkPattern)) {
      const raw = chunkMatch[0];
      const leading = raw.match(/^\s*/)?.[0].length ?? 0;
      const source = raw.trim();
      if (!source) continue;
      const chunkStart = chunkMatch.index + leading;
      const categories = detectCategories(source);
      let storageCount = 0;

      if (categories.includes("storage")) {
        const storagePattern = /\b(\d+(?:\.\d+)?)\s*(gb|gigabytes?|tb|terabytes?)\s*(?:(2[.]5(?:-inch|["”])?)\s*)?(?:(m\s*\.?\s*2|nvme|sata|pcie|pci-e)\s*)?(ssd|solid[\s-]*state(?:\s+drive)?|hdd|hard[\s-]*(?:disk|drive))\b/gi;
        const storageMatches = [...source.matchAll(storagePattern)];
        for (const match of storageMatches) {
          const capacity = capacityToGb(match[1], match[2]);
          const device = normalize(match[5]);
          const storageMedium = /\bhdd\b/.test(device) ? "hdd" : "ssd";
          const explicitInterface = normalize(match[4] ?? "");
          const interfaceName = /\b(nvme|pcie|m2)\b/.test(explicitInterface)
            ? "nvme"
            : /\bsata\b/.test(explicitInterface)
              ? "sata"
              : null;
          const formFactor = match[3] ? "2.5-inch" : /\bm2\b/.test(explicitInterface) ? "m.2" : null;
          const useWholeChunk = storageMatches.length === 1 && categories.length === 1;
          const storageSource = useWholeChunk ? source : match[0];
          const start = useWholeChunk ? chunkStart : chunkStart + match.index;
          entities.push(makeEntity("storage", storageSource, start, start + storageSource.length, {
            capacity,
            totalCapacity: capacity,
            storageMedium,
            interface: interfaceName,
            formFactor,
            containerStart: chunkStart,
            parsedArithmetic: `${displayCapacity(capacity)} ${storageMedium.toUpperCase()}; one storage device`,
          }));
          storageCount += 1;
        }
      }

      for (const category of categories) {
        if (category === "storage" && storageCount) continue;
        const span = categorySpecificSpan(source, category, categories.length);
        const entityStart = chunkStart + span.index;
        if (category === "ram") {
          const ram = parseRamDetails(span.text);
          entities.push(makeEntity("ram", span.text, entityStart, entityStart + span.text.length, {
            capacity: ram.totalCapacity,
            totalCapacity: ram.totalCapacity,
            unitCapacity: ram.unitCapacity,
            quantity: ram.quantity,
            parsedArithmetic: ram.arithmetic,
          }));
          continue;
        }
        entities.push(makeEntity(category, span.text, entityStart, entityStart + span.text.length, {
          containerStart: chunkStart,
        }));
      }
    }
    return entities;
  }

  function registeredAliases(part) {
    return [part.name, part.alias, ...(Array.isArray(part.aliases) ? part.aliases : [])]
      .filter(Boolean)
      .map(normalize);
  }

  function exactPhrase(haystack, needle) {
    if (!needle) return false;
    const text = ` ${normalize(haystack)} `;
    const phrase = ` ${normalize(needle)} `;
    return text.includes(phrase);
  }

  function conflictReason(entity, partIdentity) {
    if (entity.componentType !== partIdentity.category) return "component category conflict";
    if (entity.manufacturer && partIdentity.manufacturer && entity.manufacturer !== partIdentity.manufacturer) {
      return "manufacturer conflict";
    }
    if (entity.productFamily && partIdentity.family && entity.productFamily !== partIdentity.family) {
      return "product-family conflict";
    }
    if (entity.modelNumber && partIdentity.modelNumber && compact(entity.modelNumber) !== compact(partIdentity.modelNumber)) {
      return "model-number conflict";
    }
    if (entity.qualifiers.length && partIdentity.qualifiers.length
      && entity.qualifiers.some((item) => !partIdentity.qualifiers.includes(item))) {
      return "model-qualifier conflict";
    }
    if (entity.componentType === "gpu" && entity.modelNumber
      && !entity.qualifiers.length && partIdentity.qualifiers.length) {
      return "model-qualifier conflict";
    }
    if (entity.variant && entity.variant !== "unknown" && partIdentity.variant && partIdentity.variant !== "unknown"
      && entity.variant !== partIdentity.variant) {
      return "variant conflict";
    }
    if (entity.totalCapacity !== null && partIdentity.capacityGb !== null
      && entity.totalCapacity !== partIdentity.capacityGb) {
      return "capacity conflict";
    }
    if (entity.storageMedium && partIdentity.storageMedium
      && entity.storageMedium !== partIdentity.storageMedium) {
      return "storage-medium conflict";
    }
    if (entity.interface && partIdentity.interface && partIdentity.interface !== "unknown"
      && entity.interface !== partIdentity.interface) {
      return "storage-interface conflict";
    }
    if (entity.formFactor && partIdentity.formFactor
      && normalize(entity.formFactor) !== normalize(partIdentity.formFactor)) {
      return "storage-form-factor conflict";
    }
    if (entity.speedMhz && partIdentity.speedMhz && entity.speedMhz !== partIdentity.speedMhz) {
      return "memory-speed conflict";
    }
    if (entity.componentType === "ram" && entity.quantity !== null && entity.unitCapacity !== null
      && entity.totalCapacity !== entity.quantity * entity.unitCapacity) {
      return "RAM quantity arithmetic conflict";
    }
    return null;
  }

  function safeCandidate(part, entity) {
    const identity = part._identity;
    if (conflictReason(entity, identity)) return null;
    const source = entity.sourceText;
    const canonical = normalize(part.name).replace(/\s*\([^)]*(?:unknown|unspecified)[^)]*\)\s*/g, " ").trim();
    const aliases = registeredAliases(part);
    let rank = null;
    let reason = "";

    if (exactPhrase(source, canonical)) {
      rank = 1;
      reason = "exact canonical model";
    } else if (aliases.slice(1).some((alias) => exactPhrase(source, alias) || compact(source) === compact(alias))) {
      rank = 2;
      reason = "exact registered alias";
    } else {
      const sameManufacturer = !entity.manufacturer || !identity.manufacturer || entity.manufacturer === identity.manufacturer;
      const sameFamily = entity.productFamily && identity.family && entity.productFamily === identity.family;
      const sameModel = entity.modelNumber && identity.modelNumber
        && compact(entity.modelNumber) === compact(identity.modelNumber);
      const ambiguousVariant = sameModel && (
        !entity.variant || entity.variant === "unknown" || !identity.variant || identity.variant === "unknown"
      );

      if (sameManufacturer && sameFamily && sameModel && !ambiguousVariant) {
        rank = 3;
        reason = "same manufacturer, family and model number";
      } else if (sameManufacturer && sameFamily && sameModel && ambiguousVariant) {
        rank = 4;
        reason = "same family/model with ambiguous variant";
      } else if (entity.componentType === "storage"
        && entity.totalCapacity !== null
        && identity.capacityGb === entity.totalCapacity
        && entity.storageMedium
        && identity.storageMedium === entity.storageMedium
        && (!entity.interface || !identity.interface || identity.interface === "unknown" || entity.interface === identity.interface)) {
        rank = 3;
        reason = "same storage capacity, medium and interface";
      } else if (entity.componentType === "ram"
        && entity.totalCapacity !== null
        && identity.capacityGb === entity.totalCapacity
        && entity.productFamily
        && identity.family === entity.productFamily
        && (entity.quantity === null || !Number.isFinite(part.quantity) || entity.quantity === part.quantity)
        && (entity.unitCapacity === null || !Number.isFinite(part.unitCapacityGb) || entity.unitCapacity === part.unitCapacityGb)) {
        rank = 3;
        reason = "same RAM generation and exact calculated capacity";
      } else if (entity.componentType === "psu"
        && entity.wattage && identity.wattage === entity.wattage
        && (!entity.manufacturer || !identity.manufacturer || entity.manufacturer === identity.manufacturer)) {
        rank = 3;
        reason = "exact wattage with no manufacturer conflict";
      }
    }

    if (rank === null) return null;
    let preference = 0;
    if (entity.componentType === "gpu" && !entity.variant && identity.variant === "unknown") preference += 20;
    if (entity.componentType === "storage" && entity.modelNumber && identity.modelNumber) preference += 10;
    if (entity.componentType === "storage" && entity.formFactor && identity.formFactor === entity.formFactor) preference += 15;
    if (entity.componentType === "ram" && entity.speedMhz && identity.speedMhz === entity.speedMhz) preference += 15;
    if (part.genericVariant) preference += 20;
    return {
      part,
      rank,
      score: { 1: 0.99, 2: 0.94, 3: 0.88, 4: 0.74 }[rank],
      reason,
      preference,
    };
  }

  for (const part of parts) {
    part._identity = parseProductIdentity(part.name, part.category, part);
  }

  function entityFromQuery(source, category) {
    const detected = category ?? detectCategories(source)[0] ?? null;
    return detected ? makeEntity(detected, source, 0, source.length) : null;
  }

  function rankCandidates(sourceOrEntity, category = null, limit = 6) {
    const entity = typeof sourceOrEntity === "string"
      ? entityFromQuery(sourceOrEntity, category)
      : sourceOrEntity;
    if (!entity) return [];
    return parts
      .filter((part) => part.category === entity.componentType)
      .map((part) => safeCandidate(part, entity))
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || b.preference - a.preference || b.score - a.score || a.part.name.length - b.part.name.length)
      .slice(0, limit);
  }

  function makeMatch(result, entity) {
    const candidateIdentities = rankCandidates(entity, entity.componentType, 12);
    const variants = new Set(candidateIdentities.map(({ part }) => part._identity.variant).filter((value) => value && value !== "unknown"));
    const variantAmbiguous = !entity.variant && variants.size > 1;
    const inferences = [];
    const exactCatalogueModel = entity.modelNumber && result.part._identity.modelNumber
      && compact(entity.modelNumber) === compact(result.part._identity.modelNumber);
    if (entity.componentType === "storage" && !entity.interface
      && exactCatalogueModel && result.part._identity.interface && result.part._identity.interface !== "unknown") {
      inferences.push(`Interface inferred from exact catalogue model: ${result.part.interface ?? result.part._identity.interface}`);
    }
    return {
      uid: `match-${++uidCounter}`,
      partId: result.part.id,
      category: entity.componentType,
      segment: entity.sourceText,
      entity,
      sourceStart: entity.sourceStart,
      sourceEnd: entity.sourceEnd,
      matchScore: result.score,
      matchRank: result.rank,
      matchReason: result.reason,
      familyIdentification: result.rank <= 3 || (entity.productFamily && entity.modelNumber) ? "high" : "medium",
      variantIdentification: variantAmbiguous ? "low" : entity.variant ? "high" : "medium",
      variantAmbiguous,
      resolvedInterface: entity.interface ?? (exactCatalogueModel ? result.part._identity.interface : null),
      inferences,
      matched: true,
      alternatives: candidateIdentities.map(({ part }) => part.id),
    };
  }

  function extractedEntityLabel(entity) {
    if (entity.componentType === "ram" && entity.totalCapacity !== null) {
      const config = entity.quantity !== null ? ` (${entity.quantity}×${entity.unitCapacity}GB)` : "";
      return `${displayCapacity(entity.totalCapacity)} ${String(entity.productFamily ?? "RAM").toUpperCase()}${config}`;
    }
    if (entity.componentType === "storage" && entity.totalCapacity !== null) {
      const medium = entity.storageMedium?.toUpperCase() ?? "storage";
      const interfaceName = entity.interface ? entity.interface.toUpperCase() : "interface unknown";
      return `${displayCapacity(entity.totalCapacity)} ${medium}, ${interfaceName}`;
    }
    return entity.sourceText.replace(/^[^:]{2,20}:\s*/, "").trim();
  }

  function makeUnmatched(entity) {
    const id = `unmatched-${entity.componentType}-${compact(entity.sourceText)}-${entity.sourceStart}`;
    const part = {
      id,
      category: entity.componentType,
      name: `${extractedEntityLabel(entity)} — unmatched`,
      price: 0,
      priceLow: 0,
      priceHigh: 0,
      confidence: "low",
      valuationConfidence: "low",
      isUnmatched: true,
    };
    part._identity = parseProductIdentity(part.name, part.category, part);
    byId.set(id, part);
    const conflicts = [...new Set(parts
      .filter((candidate) => candidate.category === entity.componentType)
      .map((candidate) => conflictReason(entity, candidate._identity))
      .filter(Boolean))];
    return {
      uid: `match-${++uidCounter}`,
      partId: id,
      category: entity.componentType,
      segment: entity.sourceText,
      entity,
      sourceStart: entity.sourceStart,
      sourceEnd: entity.sourceEnd,
      matchScore: 0,
      matchRank: null,
      matchReason: "No safe catalogue candidate",
      familyIdentification: "low",
      variantIdentification: "low",
      variantAmbiguous: false,
      resolvedInterface: entity.interface,
      inferences: [],
      conflicts,
      matched: false,
      alternatives: [],
    };
  }

  function storageEntitySignature(entity) {
    return [
      entity.manufacturer,
      entity.modelNumber,
      entity.totalCapacity,
      entity.storageMedium,
      entity.interface,
    ].join("|");
  }

  function analyseDescription(description) {
    const matches = [];
    const entities = extractComponentEntities(description);

    for (const entity of entities) {
      if (entity.componentType === "storage") {
        const duplicate = matches.find((match) => (
          match.category === "storage"
          && match.entity.containerStart !== entity.containerStart
          && storageEntitySignature(match.entity) === storageEntitySignature(entity)
        ));
        if (duplicate) continue;
      } else if (matches.some((match) => match.category === entity.componentType)) {
        continue;
      }

      const best = rankCandidates(entity, entity.componentType, 12)[0];
      matches.push(best ? makeMatch(best, entity) : makeUnmatched(entity));
    }
    return matches;
  }

  function identificationConfidence(match) {
    const value = match.matched ? match.matchScore : 0;
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
      && sale.acceptedBestOfferUnknown !== true
      && sale.condition !== "faulty"
      && sale.condition !== "parts-only"
      && sale.listingStatus !== "active"
      && !(sale.sellerType === "business" && sale.condition === "new")
      && sale.includesMonitor !== true
      && sale.includesPeripherals !== true
      && sale.materiallyDifferentGpu !== true
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

  function catalogueAllowance(partId, key, label, extra = {}) {
    const part = byId.get(partId);
    const valuation = partValuation(part);
    return {
      key,
      partId,
      label: label ?? part?.name ?? key,
      low: valuation.low,
      mid: valuation.mid,
      high: valuation.high,
      valuationConfidence: "low",
      inferred: true,
      ...extra,
    };
  }

  function looksLikeCompleteDesktop(matches, description) {
    if (/\b(parts only|components only|bundle only|not a complete pc)\b/.test(normalize(description))) return false;
    const found = new Set(matches.filter((match) => match.matched).map((match) => match.category));
    const coreCount = ["cpu", "gpu", "motherboard", "ram", "storage"]
      .filter((category) => found.has(category)).length;
    return coreCount >= 4;
  }

  function inferredMotherboardAllowance() {
    const cpuMatch = state.matches.find((match) => match.category === "cpu" && match.matched);
    const cpu = byId.get(cpuMatch?.partId);
    const identity = cpu?._identity;
    if (!identity) return null;
    const model = identity.modelNumber ?? "";
    if (identity.manufacturer === "amd" && /^([1-5]\d{3})/.test(model)) {
      return catalogueAllowance(
        "motherboard-unknown-am4",
        "motherboard",
        "Unknown functional AM4 motherboard",
        { inferredFrom: cpu.name },
      );
    }
    if (identity.manufacturer === "amd" && /^[7-9]\d{3}/.test(model)) {
      return catalogueAllowance(
        "motherboard-unknown-am5",
        "motherboard",
        "Unknown functional AM5 motherboard",
        { inferredFrom: cpu.name },
      );
    }
    if (identity.manufacturer === "intel") {
      const generation = Math.floor(Number.parseInt(model, 10) / 1000);
      const platform = identity.family?.startsWith("core ultra")
        ? ["motherboard-unknown-lga1851", "Unknown functional LGA1851 motherboard"]
        : generation <= 5
        ? ["motherboard-unknown-intel-legacy", "Unknown compatible legacy Intel motherboard"]
        : generation <= 7
          ? ["motherboard-unknown-lga1151", "Unknown functional LGA1151 motherboard"]
          : generation <= 9
            ? ["motherboard-unknown-intel-300", "Unknown compatible Intel 300-series motherboard"]
            : generation <= 11
              ? ["motherboard-unknown-lga1200", "Unknown functional LGA1200 motherboard"]
              : generation <= 14
                ? ["motherboard-unknown-lga1700", "Unknown functional LGA1700 motherboard"]
                : null;
      if (platform) {
        return catalogueAllowance(
          platform[0],
          "motherboard",
          platform[1],
          { inferredFrom: cpu.name },
        );
      }
    }
    return null;
  }

  function wifiAdapterIncluded(text) {
    const mentionsWifi = /\b(wifi|wi-fi|wireless)\b/.test(text);
    if (!mentionsWifi) return false;
    if (/\b(no (?:built-in )?(?:wifi|wi-fi|wireless)|adapter (?:can|could) be added|adapter not included|no adapter|without (?:wifi|wi-fi|wireless))\b/.test(text)) {
      return false;
    }
    return /\b((?:wifi|wi-fi|wireless) (?:adapter|card|dongle) (?:included|supplied)|includes? (?:a )?(?:wifi|wi-fi|wireless) (?:adapter|card|dongle)|comes? with (?:a )?(?:wifi|wi-fi|wireless) (?:adapter|card|dongle))\b/.test(text);
  }

  function unknownAllowances() {
    if (!looksLikeCompleteDesktop(state.matches, state.description)) return [];
    const found = new Set(state.matches.filter((match) => match.matched).map((match) => match.category));
    const text = normalize(state.description);
    const allowances = [];

    if (!found.has("motherboard")) {
      const motherboard = inferredMotherboardAllowance();
      if (motherboard) allowances.push(motherboard);
    }

    if (!found.has("case")) allowances.push(catalogueAllowance("case-generic", "case", "Unknown functional case"));
    if (!found.has("psu")) allowances.push(catalogueAllowance("psu-generic-500", "psu", "Unknown-brand PSU", { risk: true }));
    if (!found.has("cooler")) allowances.push(catalogueAllowance("cooler-generic", "cooler", "Unknown/basic CPU cooler"));

    if (wifiAdapterIncluded(text)) allowances.push({
      key: "wifi",
      label: "Included Wi-Fi adapter",
      low: 5,
      mid: 10,
      high: 15,
      valuationConfidence: "low",
      inferred: false,
    });

    return allowances;
  }

  function conditionProfile(allowances) {
    const text = normalize(state.description);
    const notes = [];
    let conditionFactor = 1;
    let riskSpread = allowances.some((item) => item.risk) ? 0.025 : 0;
    const verifiedPresentation = /\b(tested|benchmarked|stress tested|verified working|cleaned and tested)\b/.test(text);
    if (verifiedPresentation) notes.push("test/clean evidence mentioned");
    if (/\b(dust|dusty|dirty|scratched|damage)\b/.test(text)) {
      conditionFactor -= 0.035;
      riskSpread += 0.03;
      notes.push("cosmetic condition risk");
    }
    if (/\b(untested|no power|faulty|for parts|spares or repair)\b/.test(text)) {
      conditionFactor -= 0.12;
      riskSpread += 0.08;
      notes.push("functional uncertainty");
    }
    if (/\b(zero feedback|0 feedback|new seller)\b/.test(text)) {
      conditionFactor -= 0.025;
      riskSpread += 0.02;
      notes.push("seller-history risk");
    }

    return {
      conditionFactor: Math.max(0.72, Math.min(1, conditionFactor)),
      cleanPremium: verifiedPresentation ? 0.05 : 0,
      riskSpread,
      notes,
    };
  }

  function storageCapacityByMedium(matches) {
    return matches
      .filter((match) => match.category === "storage" && match.entity)
      .reduce((summary, match) => {
        const medium = match.entity.storageMedium;
        if (medium && match.entity.totalCapacity) summary[medium] += match.entity.totalCapacity;
        return summary;
      }, { ssd: 0, hdd: 0 });
  }

  function comparableScore(sale) {
    const selected = new Map(state.matches.map((match) => [match.category, byId.get(match.partId)]));
    const cpuIdentity = selected.get("cpu")?._identity;
    const gpuIdentity = selected.get("gpu")?._identity;
    const saleCpu = parseProductIdentity(sale.cpu ?? "", "cpu");
    const saleGpu = parseProductIdentity(sale.gpu ?? "", "gpu");
    const ram = state.matches.find((match) => match.category === "ram")?.entity?.totalCapacity ?? 0;
    const storage = storageCapacityByMedium(state.matches);
    let score = 0;

    if (cpuIdentity?.family && cpuIdentity.family === saleCpu.family) score += 0.12;
    if (cpuIdentity?.modelNumber && cpuIdentity.modelNumber === saleCpu.modelNumber) score += 0.18;
    if (gpuIdentity?.family && gpuIdentity.family === saleGpu.family) score += 0.15;
    if (gpuIdentity?.modelNumber && gpuIdentity.modelNumber === saleGpu.modelNumber) score += 0.22;
    if (gpuIdentity?.variant && gpuIdentity.variant !== "unknown" && gpuIdentity.variant === saleGpu.variant) score += 0.12;
    if (sale.ramGb && ram === sale.ramGb) score += 0.08;
    if (sale.ssdGb !== undefined && storage.ssd === sale.ssdGb) score += 0.05;
    if (sale.hddGb !== undefined && storage.hdd === sale.hddGb) score += 0.03;
    if (sale.storageGb && storage.ssd + storage.hdd === sale.storageGb) score += 0.06;
    if (sale.sellerType === "private") score += 0.025;
    if (sale.condition === "used") score += 0.025;
    return score;
  }

  function systemComparables() {
    const close = (marketSales.systems ?? [])
      .map((sale) => ({ sale, score: comparableScore(sale) }))
      .filter((item) => item.score >= 0.62);
    const exact = close
      .filter(({ sale }) => eligibleExactSale(sale, 180))
      .map(({ sale, score }) => ({
        value: normalisedSellerPrice(sale),
        weight: score
          * (sale.sellerType === "private" ? 1 : 0.7)
          * (sale.condition === "used" ? 1 : 0.75)
          * Math.exp((-Math.LN2 * saleAgeDays(sale)) / 60),
      }));
    const censored = close.filter(({ sale }) => (
      sale.priceType === "upper-bound"
      || sale.bestOfferAccepted === true
      || sale.acceptedBestOfferUnknown === true
    ));
    return { exact, censored };
  }

  function makeBand(low, mid, high) {
    return {
      low: Math.max(0, roundFive(low)),
      mid: roundFive(mid),
      high: roundFive(high),
    };
  }

  function seededRandom(seedText) {
    let seed = 2166136261;
    for (const char of seedText) {
      seed ^= char.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function triangularSample(low, mode, high, random) {
    if (high <= low) return low;
    const boundedMode = Math.max(low, Math.min(high, mode));
    const split = (boundedMode - low) / (high - low);
    const draw = random();
    if (draw < split) return low + Math.sqrt(draw * (high - low) * (boundedMode - low));
    return high - Math.sqrt((1 - draw) * (high - low) * (high - boundedMode));
  }

  function ordinaryQuantile(values, quantile) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    const index = (ordered.length - 1) * quantile;
    const lower = Math.floor(index);
    const fraction = index - lower;
    return ordered[lower] + ((ordered[lower + 1] ?? ordered[lower]) - ordered[lower]) * fraction;
  }

  function anchoredDistributionSample(anchors, random) {
    const draw = random();
    for (let index = 1; index < anchors.length; index += 1) {
      const [rightQuantile, rightValue] = anchors[index];
      const [leftQuantile, leftValue] = anchors[index - 1];
      if (draw <= rightQuantile) {
        const position = (draw - leftQuantile) / (rightQuantile - leftQuantile);
        return leftValue + (rightValue - leftValue) * position;
      }
    }
    return anchors.at(-1)[1];
  }

  function componentDistribution(partDetails, allowances, sampleCount = 12_000) {
    const random = seededRandom(`${state.description}|${marketSales.referenceDate}`);
    const componentSamples = [];
    const saleSamples = [];
    const complete = looksLikeCompleteDesktop(state.matches, state.description);
    const profile = conditionProfile(allowances);

    for (let index = 0; index < sampleCount; index += 1) {
      let componentValue = 0;
      for (const item of partDetails) {
        componentValue += triangularSample(
          item.valuation.low,
          item.valuation.mid,
          item.valuation.high,
          random,
        );
      }
      for (const allowance of allowances) {
        componentValue += triangularSample(
          allowance.low,
          allowance.mid ?? (allowance.low + allowance.high) / 2,
          allowance.high,
          random,
        );
      }
      componentSamples.push(componentValue);
      const bundleFactor = complete && componentValue < 500
        ? anchoredDistributionSample([
          [0, 0.78],
          [0.25, 0.85],
          [0.5, 0.93],
          [0.75, 1.02],
          [1, 1.08],
        ], random)
        : complete
          ? anchoredDistributionSample([
            [0, 0.72],
            [0.25, 0.82],
            [0.5, 0.9],
            [0.75, 0.98],
            [1, 1.03],
          ], random)
          : 1;
      const riskFactor = triangularSample(
        Math.max(0.7, profile.conditionFactor - profile.riskSpread),
        profile.conditionFactor,
        profile.conditionFactor,
        random,
      );
      saleSamples.push(componentValue * bundleFactor * riskFactor);
    }

    return { componentSamples, saleSamples, sampleCount, profile };
  }

  function calculateValuation() {
    const partDetails = state.matches
      .map((match) => ({ match, part: byId.get(match.partId) }))
      .filter(({ part }) => Boolean(part))
      .map(({ match, part }) => ({ match, part, valuation: partValuation(part) }));
    const componentLow = partDetails.reduce((sum, item) => sum + item.valuation.low, 0);
    const componentMid = partDetails.reduce((sum, item) => sum + item.valuation.mid, 0);
    const componentHigh = partDetails.reduce((sum, item) => sum + item.valuation.high, 0);

    const allowances = unknownAllowances();
    const allowanceLow = allowances.reduce((sum, item) => sum + item.low, 0);
    const allowanceHigh = allowances.reduce((sum, item) => sum + item.high, 0);
    const allowanceMid = allowances.reduce((sum, item) => sum + (item.mid ?? (item.low + item.high) / 2), 0);
    const distribution = componentDistribution(partDetails, allowances);
    const completeP25 = ordinaryQuantile(distribution.componentSamples, 0.25);
    const completeP50 = ordinaryQuantile(distribution.componentSamples, 0.5);
    const completeP75 = ordinaryQuantile(distribution.componentSamples, 0.75);
    let p25 = ordinaryQuantile(distribution.saleSamples, 0.25);
    let p50 = ordinaryQuantile(distribution.saleSamples, 0.5);
    let p75 = ordinaryQuantile(distribution.saleSamples, 0.75);
    let quick = makeBand(
      ordinaryQuantile(distribution.saleSamples, 0.12),
      p25,
      ordinaryQuantile(distribution.saleSamples, 0.35),
    );
    let fair = makeBand(p25, p50, p75);
    const cleanCap = p50 * (1 + distribution.profile.cleanPremium);
    let clean = makeBand(
      Math.min(ordinaryQuantile(distribution.saleSamples, 0.65), cleanCap),
      Math.min(p75, cleanCap),
      Math.min(ordinaryQuantile(distribution.saleSamples, 0.85), cleanCap),
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
      p25 = comparableBands.quick * comparableWeight + p25 * partsWeight;
      p50 = comparableBands.fair * comparableWeight + p50 * partsWeight;
      p75 = comparableBands.clean * comparableWeight + p75 * partsWeight;
      quick = makeBand(p25 * 0.94, p25, p50);
      fair = makeBand(p25, p50, p75);
      clean = makeBand(p50, p75, p75 * 1.04);
      method = `${comparables.exact.length} close, uncensored whole-PC sales blended with adjusted parts value.`;
    } else {
      const censoredCopy = comparables.censored.length
        ? ` ${comparables.censored.length} close Best Offer/upper-bound comp was excluded from the median.`
        : "";
      method = `Fewer than 2 usable whole-PC comparables; ${distribution.sampleCount.toLocaleString("en-GB")}-sample triangular component distribution and used-PC bundle factor used.${censoredCopy}`;
    }

    return {
      partDetails,
      componentRange: { low: componentLow, mid: componentMid, high: componentHigh },
      componentMid,
      allowances,
      allowanceLow,
      allowanceMid,
      allowanceHigh,
      completeParts: {
        low: roundFive(completeP25),
        mid: roundFive(completeP50),
        high: roundFive(completeP75),
      },
      quick,
      fair,
      clean,
      percentiles: { p25: roundFive(p25), p50: roundFive(p50), p75: roundFive(p75) },
      sampleCount: distribution.sampleCount,
      method,
      conditionNotes: distribution.profile.notes,
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
    const categoryShort = match.category === "storage" && match.entity.storageMedium === "hdd"
      ? "HDD"
      : category.short;
    const identification = identificationConfidence(match);
    const valuation = partValuation(selected);
    const options = [...new Set([match.partId, ...match.alternatives])]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((part) => `<option value="${part.id}" ${part.id === selected.id ? "selected" : ""}>${escapeHtml(part.name)} — ${formatRange(partValuation(part))}</option>`)
      .join("");

    return `
      <div class="part-row" data-match-id="${match.uid}">
        <span class="category-icon" aria-hidden="true">${categoryShort}</span>
        <span class="part-category">${category.label}</span>
        <div class="part-selection">
          <label class="sr-only" for="select-${match.uid}">Matched ${category.label}</label>
          <select id="select-${match.uid}" data-action="change-part">${options}</select>
          <div class="match-meta">
            <span class="match-pill ${match.familyIdentification}">Family: ${match.familyIdentification[0].toUpperCase()}${match.familyIdentification.slice(1)}</span>
            <span class="match-pill ${match.variantIdentification}">Variant: ${match.variantIdentification[0].toUpperCase()}${match.variantIdentification.slice(1)}</span>
            <span class="match-pill ${valuation.confidence}">Value: ${valuation.confidence[0].toUpperCase()}${valuation.confidence.slice(1)}</span>
            <span title="${escapeHtml(match.segment)}">Extracted “${escapeHtml(extractedEntityLabel(match.entity))}” from “${escapeHtml(match.segment.slice(0, 48))}${match.segment.length > 48 ? "…" : ""}”</span>
            ${match.entity.parsedArithmetic ? `<span>${escapeHtml(match.entity.parsedArithmetic)}</span>` : ""}
            <span>${escapeHtml(match.matched ? `Matched by ${match.matchReason}` : "No safe catalogue match")}</span>
            ${match.inferences.map((inference) => `<span>${escapeHtml(inference)}</span>`).join("")}
            ${match.conflicts?.length ? `<span>Rejected conflicts: ${escapeHtml(match.conflicts.join(", "))}</span>` : ""}
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
    const found = new Set(state.matches.filter((match) => match.matched).map((match) => match.category));
    const allowanceKeys = new Set(valuation.allowances.map((item) => item.key));
    const missing = Object.entries(CATEGORY_META)
      .filter(([key, meta]) => meta.required && !found.has(key) && !allowanceKeys.has(key))
      .map(([, meta]) => meta.label);
    const lowIdentification = state.matches.filter((match) => identificationConfidence(match).className === "low");
    const lowValuation = valuation.partDetails.filter((item) => item.valuation.confidence === "low");
    const unmatched = state.matches.filter((match) => !match.matched);
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

    if (unmatched.length) {
      warnings.push(warningMarkup(
        "warning",
        "No unsafe substitutions made",
        `${unmatched.length} extracted ${unmatched.length === 1 ? "entity has" : "entities have"} no conflict-free catalogue match and remains unpriced.`,
      ));
    }

    if (lowValuation.length) {
      warnings.push(warningMarkup("warning", "Wide price uncertainty", `${lowValuation.length} identified ${lowValuation.length === 1 ? "component has" : "components have"} low valuation confidence.`));
    }

    if (/rtx 5060 ti 16gb/.test(text) && !/\bti\b/.test(normalize(state.description))) {
      warnings.push(warningMarkup("warning", "Interpreted RTX 5060 16GB", "This was treated as RTX 5060 Ti 16GB; confirm the Ti label."));
    }

    const matchedPsuHasKnownWattage = state.matches.some((match) => (
      match.category === "psu" && Number.isFinite(byId.get(match.partId)?.wattage)
    ));
    if (
      /corsair/.test(text)
      && /\b(psu|power supply)\b/.test(text)
      && !/\b\d{3,4}w\b/.test(text)
      && !matchedPsuHasKnownWattage
    ) {
      warnings.push(warningMarkup("warning", "PSU wattage missing", "A modest value range is included, but the unknown model increases buyer risk."));
    }

    if (state.matches.some((match) => /interface unknown/.test(byId.get(match.partId)?.name ?? ""))) {
      warnings.push(warningMarkup("warning", "SSD interface missing", "NVMe and SATA drives have different values."));
    }

    if (state.matches.some((match) => (
      match.category === "psu" && /brand\/model unknown/i.test(byId.get(match.partId)?.name ?? "")
    )) || valuation.allowances.some((item) => item.key === "psu" && item.risk)) {
      warnings.push(warningMarkup(
        "warning",
        "Unknown PSU replacement risk",
        "The PSU receives only a token allowance; brand, protection quality and remaining life are unverified.",
      ));
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
    elements.partsTotal.textContent = formatRange(valuation.componentRange);
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
    elements.percentileSummary.textContent = `P25 ${formatGBP(valuation.percentiles.p25)} · P50 ${formatGBP(valuation.percentiles.p50)} · P75 ${formatGBP(valuation.percentiles.p75)}`;
    elements.matchCount.textContent = `${state.matches.length} ${state.matches.length === 1 ? "part" : "parts"}`;
    elements.matchSummary.textContent = state.matches.length
      ? `Found ${state.matches.length} priced ${state.matches.length === 1 ? "component" : "components"}${valuation.allowances.length ? ` plus ${valuation.allowances.length} essential ${valuation.allowances.length === 1 ? "allowance" : "allowances"}` : ""}.`
      : "No reliable component matches were found.";
    elements.warningsList.innerHTML = buildWarnings(valuation);
    elements.valuationMethod.textContent = `${valuation.method} This is the seller/item price before any seller fees; the buyer's all-in total, Buyer Protection and delivery are excluded.`;

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
    match.matched = !byId.get(select.value)?.isUnmatched;
    match.familyIdentification = "high";
    match.variantIdentification = byId.get(select.value)?._identity?.variant === "unknown" ? "low" : "high";
    match.variantAmbiguous = match.variantIdentification === "low";
    match.matchReason = "manual correction";
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
    const entity = entityFromQuery(query, null);
    const best = entity ? rankCandidates(entity, entity.componentType, 1)[0] : null;
    if (!best) return;

    const duplicate = best.part.category === "storage"
      ? state.matches.find((match) => (
        match.category === "storage" && storageEntitySignature(match.entity) === storageEntitySignature(entity)
      ))
      : state.matches.find((match) => match.category === best.part.category || match.partId === best.part.id);
    if (duplicate) {
      elements.manualSearch.value = "";
      return;
    }

    state.matches.push(makeMatch(best, entity));
    elements.manualSearch.value = "";
    render();
  });

  elements.manualSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") elements.addPartButton.click();
  });

  window.RigWorth = {
    analyseDescription,
    extractComponentEntities,
    parseProductIdentity,
    rankCandidates,
    estimateDescription: (description) => {
      const previousDescription = state.description;
      const previousMatches = state.matches;
      state.description = description;
      state.matches = analyseDescription(description);
      const valuation = calculateValuation();
      const estimate = {
        matches: state.matches.map((match) => ({ ...match, part: byId.get(match.partId) })),
        valuation,
        warningsHtml: buildWarnings(valuation),
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
