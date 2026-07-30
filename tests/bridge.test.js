const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "bridge-server.js");

function loadBridgeModule(env = {}) {
  const previousKey = process.env.BRIDGE_API_KEY;
  const previousAllowedOrigins = process.env.BRIDGE_ALLOWED_ORIGINS;
  if (typeof env.BRIDGE_API_KEY === "string") {
    process.env.BRIDGE_API_KEY = env.BRIDGE_API_KEY;
  } else {
    delete process.env.BRIDGE_API_KEY;
  }

  if (typeof env.BRIDGE_ALLOWED_ORIGINS === "string") {
    process.env.BRIDGE_ALLOWED_ORIGINS = env.BRIDGE_ALLOWED_ORIGINS;
  } else {
    delete process.env.BRIDGE_ALLOWED_ORIGINS;
  }

  delete require.cache[require.resolve(modulePath)];
  const bridge = require(modulePath);

  if (typeof previousKey === "string") {
    process.env.BRIDGE_API_KEY = previousKey;
  } else {
    delete process.env.BRIDGE_API_KEY;
  }

  if (typeof previousAllowedOrigins === "string") {
    process.env.BRIDGE_ALLOWED_ORIGINS = previousAllowedOrigins;
  } else {
    delete process.env.BRIDGE_ALLOWED_ORIGINS;
  }

  return bridge;
}

function createRequest(headers = {}) {
  return {
    get(name) {
      return headers[String(name || "").toLowerCase()] || "";
    }
  };
}

test("bridge denies forged same-origin requests when API key is configured", () => {
  const bridge = loadBridgeModule({ BRIDGE_API_KEY: "top-secret" });
  const req = createRequest({
    host: "copy.example.com",
    origin: "https://copy.example.com",
    referer: "https://copy.example.com/app"
  });

  assert.equal(bridge.hasAuthorizedBridgeAccess(req), false);
});

test("bridge allows local browser requests when API key is not configured", () => {
  const bridge = loadBridgeModule();
  const req = createRequest({
    host: "localhost:3456",
    origin: "https://localhost:3456"
  });

  assert.equal(bridge.hasAuthorizedBridgeAccess(req), true);
});

test("bridge allows explicitly configured public origins when API key is not configured", () => {
  const bridge = loadBridgeModule({
    BRIDGE_ALLOWED_ORIGINS: "https://copy.bktsai.link"
  });
  const req = createRequest({
    host: "copy.bktsai.link",
    "x-forwarded-host": "copy.bktsai.link",
    origin: "https://copy.bktsai.link"
  });

  assert.equal(bridge.hasAuthorizedBridgeAccess(req), true);
});

test("resolveSafeOutputUrl rejects private URLs from model output", () => {
  const bridge = loadBridgeModule();

  assert.equal(
    bridge.resolveSafeOutputUrl("http://localhost:3000/secret", "https://lihi.io/product"),
    "https://lihi.io/product"
  );
  assert.equal(
    bridge.resolveSafeOutputUrl("https://127.0.0.1/private", ""),
    ""
  );
});

test("parseChannelCopyOutput falls back to the safe default URL", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "值得先看",
      body: "把重點整理清楚再帶你往下看。",
      cta: "立即了解",
      url: "https://localhost/internal"
    }),
    "primary",
    "https://lihi.io/product"
  );

  assert.equal(output.url, "https://lihi.io/product");
});

test("compliance mode sanitizes risky terms from master draft", () => {
  const bridge = loadBridgeModule();
  const draft = bridge.parseMasterDraftOutput(
    JSON.stringify({
      hook: "提升免疫力，7天見效",
      audience_angle: "想改善睡眠的人",
      value_prop: "這款產品主打提升免疫力與改善睡眠。",
      benefit_points: ["提升免疫力", "改善睡眠", "日常補給"],
      proof_points: ["醫師推薦"],
      cta: "立即見效",
      tone_note: "高效見證",
      url: "https://lihi.io/product"
    }),
    {
      productName: "測試產品",
      benefits: ["提升免疫力", "改善睡眠", "日常補給"],
      tone: "brand",
      voiceBalance: 3,
      productUrl: "https://lihi.io/product",
      complianceMode: true
    }
  );

  assert.equal(bridge.detectTaiwanComplianceViolations(draft.hook).length, 0);
  assert.equal(bridge.detectTaiwanComplianceViolations(draft.valueProp).length, 0);
  assert.equal(draft.toneNote.includes("台灣食品廣告合規模式"), true);
});

test("compliance mode sanitizes risky terms from channel output", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "提升免疫力",
      body: "7天見效，還能改善睡眠。",
      cta: "立即見效",
      url: "https://lihi.io/product"
    }),
    "primary",
    "https://lihi.io/product",
    {
      complianceMode: true,
      contextInput: {
        productName: "測試產品",
        productUrl: "https://lihi.io/product"
      }
    }
  );

  assert.equal(bridge.detectTaiwanComplianceViolations(output.title).length, 0);
  assert.equal(bridge.detectTaiwanComplianceViolations(output.body).length, 0);
  assert.equal(bridge.detectTaiwanComplianceViolations(output.cta).length, 0);
});

test("formatPrimaryOutput avoids internal field labels in user-facing copy", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatPrimaryOutput(
    {
      hook: "今晚想吃得舒服一點",
      valueProp: "把晚餐準備得更快，也更有滿足感",
      benefitPoints: ["天然食材", "熬煮夠久", "加熱方便"],
      proofPoints: ["已幫你把份量與食用方式整理清楚。"],
      cta: "立即了解更多",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  assert.equal(output.body.includes("重點優點："), false);
  assert.match(output.body, /這次會把 天然食材、熬煮夠久、加熱方便 這幾個重點整理清楚。/);
});

test("formatMetaAdOutput avoids internal field labels in user-facing copy", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatMetaAdOutput(
    {
      hook: "先把產品重點整理給你",
      valueProp: "把選擇理由講得更清楚",
      benefitPoints: ["天然食材", "加熱方便"],
      proofPoints: ["很多人第一次買就先從這款開始。"],
      cta: "立即了解更多",
      audienceAngle: "忙碌上班族",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  assert.equal(output.body.includes("重點優點："), false);
  assert.match(output.body, /這次也把 天然食材、加熱方便 這幾個重點整理給你。/);
});

test("formatMetaAdOutput keeps readable paragraphs within 120 to 150 chars before url", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatMetaAdOutput(
    {
      hook: "先把產品重點整理給你",
      valueProp: "這款產品把日常保養的資訊整理得更清楚，也更容易快速理解",
      benefitPoints: ["天然食材", "加熱方便", "份量清楚"],
      proofPoints: ["很多人第一次買就先從這款開始。"],
      cta: "立即了解更多",
      audienceAngle: "忙碌上班族",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  const bodyWithoutUrl = output.body.replace(/\n\nhttps:\/\/lihi\.io\/product$/, "");
  const compactLength = bodyWithoutUrl.replace(/\s+/g, "").length;

  assert.equal(bodyWithoutUrl.includes("\n\n"), true);
  assert.equal(compactLength >= 120 && compactLength <= 150, true);
});

test("formatEmailOutput keeps email copy direct and avoids report-like template phrases", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatEmailOutput(
    {
      hook: "先把這款產品的重點講清楚",
      valueProp: "把日常補給整理得更容易理解",
      benefitPoints: ["無加糖", "無人工調味", "無防腐劑"],
      proofPoints: ["花蓮嚴選南瓜，慢慢熬出自然風味。"],
      cta: "點開看看",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  assert.equal(output.body.includes("這次想先把"), false);
  assert.equal(output.body.includes("這次想先跟你分享"), false);
  assert.match(output.body, /無加糖，花蓮嚴選南瓜，慢慢熬出自然風味。/);
  assert.equal(output.description, "無加糖");
});

test("formatEmailOutput keeps readable paragraph spacing", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatEmailOutput(
    {
      hook: "先把這款產品的重點講清楚",
      valueProp: "把日常補給整理得更容易理解，也讓送禮時更容易傳達心意",
      benefitPoints: ["無加糖", "無人工調味", "無防腐劑"],
      proofPoints: ["花蓮嚴選南瓜，慢慢熬出自然風味。"],
      cta: "點開看看",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  assert.equal(output.body.includes("\n\n"), true);
  assert.match(output.body, /點開看看\n\nhttps:\/\/lihi\.io\/product$/);
});

test("formatGoogleAdsOutput returns three headline and description variants", () => {
  const bridge = loadBridgeModule();
  const output = bridge.formatGoogleAdsOutput(
    {
      hook: "先把南瓜濃湯的重點講清楚",
      valueProp: "把這款濃湯的產品資訊整理得更好懂",
      benefitPoints: ["無加糖", "無人工調味", "無防腐劑"],
      proofPoints: ["花蓮嚴選南瓜，慢慢熬出自然風味。"],
      cta: "點開看看",
      audienceAngle: "重視成分的人",
      url: "https://lihi.io/product"
    },
    "https://lihi.io/product"
  );

  const titleLines = output.title.split("\n");
  const bodyLines = output.body.split("\n");

  assert.equal(titleLines.length, 3);
  assert.equal(bodyLines.length, 3);
  assert.match(titleLines[0], /^1\.\s/);
  assert.match(titleLines[1], /^2\.\s/);
  assert.match(titleLines[2], /^3\.\s/);
  assert.match(bodyLines[0], /^1\.\s/);
  assert.match(bodyLines[1], /^2\.\s/);
  assert.match(bodyLines[2], /^3\.\s/);
});

test("stripSourceScaffoldingPhrases removes source-wrapper wording", () => {
  const bridge = loadBridgeModule();

  assert.equal(
    bridge.stripSourceScaffoldingPhrases("銷售頁面明確標示無加糖、無人工調味、無防腐劑"),
    "無加糖、無人工調味、無防腐劑"
  );
  assert.equal(
    bridge.stripSourceScaffoldingPhrases("圖片顯示適合兩人分享"),
    "適合兩人分享"
  );
});

test("stripReportLikePhrases removes report-style transitions", () => {
  const bridge = loadBridgeModule();

  assert.equal(
    bridge.stripReportLikePhrases("製程數據透明且嚴格：累積 10 年專業熬煮經驗，每日持續 6 小時慢工細作。"),
    "累積 10 年專業熬煮經驗，每日持續 6 小時慢工細作。"
  );
  assert.equal(
    bridge.stripReportLikePhrases("以事實支撐品質，用數據定義標準。"),
    ""
  );
});

test("normalizeTraditionalChineseText converts common simplified Chinese to traditional", () => {
  const bridge = loadBridgeModule();

  assert.equal(
    bridge.normalizeTraditionalChineseText("让这碗汤把重点说清楚，给你更多温暖。"),
    "讓這碗湯把重點說清楚，給你更多溫暖。"
  );
  assert.equal(
    bridge.normalizeTraditionalChineseText("花 30 秒選好礼，這不是成分的组合。"),
    "花 30 秒選好禮，這不是成分的組合。"
  );
});

test("parseChannelCopyOutput strips scaffolding wording and simplified Chinese", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "这碗汤值得你看",
      body: "銷售頁面明確標示無加糖、無人工調味、無防腐劑。\n\n让你更快看懂重点。",
      cta: "立即了解更多",
      url: "https://lihi.io/product"
    }),
    "primary",
    "https://lihi.io/product"
  );

  assert.equal(output.title, "這碗湯值得你看");
  assert.equal(output.body.includes("銷售頁面明確標示"), false);
  assert.match(output.body, /無加糖、無人工調味、無防腐劑。/);
  assert.match(output.body, /讓你更快看懂重點。/);
});

test("parseChannelCopyOutput strips report-style transitions", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "先把重點說清楚",
      body: "製程數據透明且嚴格：累積 10 年專業熬煮經驗，每日持續 6 小時慢工細作。\n\n以事實支撐品質，用數據定義標準。",
      cta: "立即了解更多",
      url: "https://lihi.io/product"
    }),
    "primary",
    "https://lihi.io/product"
  );

  assert.equal(output.body.includes("製程數據透明且嚴格"), false);
  assert.equal(output.body.includes("以事實支撐品質"), false);
  assert.match(output.body, /累積 10 年專業熬煮經驗，每日持續 6 小時慢工細作。/);
});

test("parseChannelCopyOutput preserves google ads variants as three lines", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "1. 無加糖南瓜濃湯\n2. 無人工調味也好懂\n3. 無防腐劑先看",
      body: "1. 先看無加糖與原料重點。\n2. 把成分與風味整理得更清楚。\n3. 花蓮嚴選南瓜資訊一次看懂。",
      description: "pumpkin-soup",
      cta: "product-info",
      url: "https://lihi.io/product"
    }),
    "google_ads",
    "https://lihi.io/product"
  );

  assert.equal(output.title.split("\n").length, 3);
  assert.equal(output.body.split("\n").length, 3);
  assert.match(output.title, /^1\.\s/m);
  assert.match(output.body, /^1\.\s/m);
});

test("parseChannelCopyOutput fills google ads variants up to three groups", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "1. 活力補給先看",
      body: "1. 先看產品資訊與使用情境。",
      description: "heppiliv",
      cta: "product-info",
      url: "https://www.enkibio.com/products/heppiliv"
    }),
    "google_ads",
    "https://www.enkibio.com/products/heppiliv",
    {
      contextInput: {
        masterDraft: {
          hook: "活力補給先看",
          valueProp: "先把產品資訊與使用情境整理清楚",
          benefitPoints: ["專利技術", "植萃成分", "日常保養"],
          proofPoints: ["把產品資訊與使用情境整理清楚。"],
          cta: "立即了解",
          audienceAngle: "重視日常保養的人"
        }
      }
    }
  );

  assert.equal(output.title.split("\n").length, 3);
  assert.equal(output.body.split("\n").length, 3);
});

test("parseChannelCopyOutput rewrites duplicate google ads variants into three distinct lines", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "1. 活力補給先看\n2. 活力補給先看\n3. 活力補給先看",
      body: "1. 先看產品資訊與使用情境。\n2. 先看產品資訊與使用情境。\n3. 先看產品資訊與使用情境。",
      description: "heppiliv",
      cta: "product-info",
      url: "https://www.enkibio.com/products/heppiliv"
    }),
    "google_ads",
    "https://www.enkibio.com/products/heppiliv",
    {
      contextInput: {
        masterDraft: {
          hook: "活力補給先看",
          valueProp: "先把產品資訊與使用情境整理清楚",
          benefitPoints: ["專利技術", "植萃成分", "日常保養"],
          proofPoints: ["把產品資訊與使用情境整理清楚。"],
          cta: "立即了解",
          audienceAngle: "重視日常保養的人"
        }
      }
    }
  );

  const titleLines = output.title.split("\n").map((item) => item.replace(/^\d+\.\s*/, "").trim());
  const bodyLines = output.body.split("\n").map((item) => item.replace(/^\d+\.\s*/, "").trim());
  assert.equal(titleLines.length, 3);
  assert.equal(bodyLines.length, 3);
  assert.equal(new Set(titleLines).size, 3);
  assert.equal(new Set(bodyLines).size, 3);
});

test("parseChannelCopyOutput removes truncated email endings before cta", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "為重要的人挑選貼心好禮",
      body: "讓這份充滿心意的選擇，代…",
      description: "先看產品重點",
      cta: "為重要的人挑選貼心好禮",
      url: "https://www.enkibio.com/products/heppiliv"
    }),
    "email",
    "https://www.enkibio.com/products/heppiliv"
  );

  assert.equal(output.body.includes("代…"), false);
  assert.match(output.body, /為重要的人挑選貼心好禮\nhttps:\/\/www\.enkibio\.com\/products\/heppiliv$/);
});

test("parseChannelCopyOutput removes inline urls from email body before appending final url", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "先把重點講清楚",
      body: "想了解這款產品如何協助您的日常保養，：https://www.enkibio.com/products/heppiliv",
      description: "先看產品重點",
      cta: "點開看看詳細介紹",
      url: "https://www.enkibio.com/products/heppiliv"
    }),
    "email",
    "https://www.enkibio.com/products/heppiliv"
  );

  assert.equal(output.body.includes("：https://"), false);
  assert.equal((output.body.match(/https:\/\/www\.enkibio\.com\/products\/heppiliv/g) || []).length, 1);
  assert.match(output.body, /點開看看詳細介紹\nhttps:\/\/www\.enkibio\.com\/products\/heppiliv$/);
});

test("parseChannelCopyOutput cleans dangling punctuation after stripping email inline urls", () => {
  const bridge = loadBridgeModule();
  const output = bridge.parseChannelCopyOutput(
    JSON.stringify({
      title: "先把重點講清楚",
      body: "我們整理了詳細資訊。 ，了解 Heppi Liv 如何成為你的保養夥伴。 https://www.enkibio.com/products/heppiliv",
      description: "先看產品重點",
      cta: "立即查看完整資訊",
      url: "https://www.enkibio.com/products/heppiliv"
    }),
    "email",
    "https://www.enkibio.com/products/heppiliv"
  );

  assert.equal(output.body.includes("。 ，"), false);
  assert.match(output.body, /我們整理了詳細資訊。 了解 Heppi Liv 如何成為你的保養夥伴。/);
});

test("resolveStylePresetKey maps random to a concrete preset", () => {
  const bridge = loadBridgeModule();
  const resolved = bridge.resolveStylePresetKey("random");

  assert.notEqual(resolved, "random");
  assert.equal(
    [
      "home_healing",
      "sharing_moment",
      "childhood_memory",
      "premium_brand",
      "founder_story",
      "social_proof",
      "scenario_solution",
      "rational_comparison",
      "gift_recommendation",
      "urgency_conversion"
    ].includes(resolved),
    true
  );
});

test("parsePrimaryBundleOutput returns both master draft and primary output", () => {
  const bridge = loadBridgeModule();
  const result = bridge.parsePrimaryBundleOutput(
    JSON.stringify({
      master_draft: {
        hook: "先把南瓜的甜味講清楚",
        audience_angle: "重視食材的人",
        value_prop: "用慢熬把風味留住",
        benefit_points: ["花蓮嚴選南瓜", "每日慢熬", "無人工調味"],
        proof_points: ["無人工調味", "無防腐劑"],
        cta: "立即了解更多",
        tone_note: "品牌型；平衡",
        url: "https://lihi.io/product"
      },
      primary_output: {
        title: "先把南瓜的甜味講清楚",
        body: "花蓮嚴選南瓜，搭配每日慢熬，讓風味更乾淨。",
        cta: "立即了解更多",
        url: "https://lihi.io/product"
      }
    }),
    {
      productName: "測試南瓜濃湯",
      benefits: ["花蓮嚴選南瓜", "每日慢熬", "無人工調味"],
      tone: "brand",
      stylePreset: "home_healing",
      voiceBalance: 3,
      productUrl: "https://lihi.io/product",
      complianceMode: false
    }
  );

  assert.equal(result.masterDraft.hook, "先把南瓜的甜味講清楚");
  assert.equal(result.output.title, "先把南瓜的甜味講清楚");
  assert.match(result.output.body, /花蓮嚴選南瓜/);
});

test("parseMasterDraftOutput normalizes lengths for downstream formatter reuse", () => {
  const bridge = loadBridgeModule();
  const long = "很長".repeat(120);
  const draft = bridge.parseMasterDraftOutput(
    JSON.stringify({
      hook: long,
      audience_angle: long,
      value_prop: long.repeat(2),
      benefit_points: [long, "專利技術", "植萃成分", "日常保養"],
      proof_points: [long],
      cta: long,
      tone_note: long,
      url: "https://example.com/product"
    }),
    {
      productName: "測試產品",
      benefits: ["專利技術", "植萃成分", "日常保養"],
      tone: "brand",
      voiceBalance: 3,
      productUrl: "https://example.com/product",
      stylePreset: "random",
      complianceMode: false
    }
  );

  assert.equal(draft.hook.length <= 120, true);
  assert.equal(draft.audienceAngle.length <= 120, true);
  assert.equal(draft.valueProp.length <= 300, true);
  assert.equal(draft.cta.length <= 60, true);
  assert.equal(draft.toneNote.length <= 120, true);
  assert.equal(draft.benefitPoints.every((item) => item.length <= 80), true);
  assert.equal(draft.proofPoints.every((item) => item.length <= 120), true);
});

test("normalizeReusableMasterDraft trims long client payloads before formatter validation", () => {
  const bridge = loadBridgeModule();
  const long = "很長".repeat(120);
  const draft = bridge.normalizeReusableMasterDraft(
    {
      hook: long,
      audienceAngle: long,
      valueProp: long.repeat(2),
      benefitPoints: [long, "專利技術"],
      proofPoints: [long],
      cta: long,
      toneNote: long,
      url: "https://example.com/product"
    },
    "https://example.com/product"
  );

  assert.equal(draft.hook.length, 120);
  assert.equal(draft.audienceAngle.length, 120);
  assert.equal(draft.valueProp.length <= 300, true);
  assert.equal(draft.cta.length <= 60, true);
  assert.equal(draft.toneNote.length <= 120, true);
  assert.equal(draft.benefitPoints[0].length <= 80, true);
  assert.equal(draft.proofPoints[0].length <= 120, true);
});

test("summarizePageSignals avoids wrapper phrases in summary", () => {
  const bridge = loadBridgeModule();
  const summary = bridge.summarizePageSignals({
    captureMode: "html",
    title: "南瓜濃湯",
    headings: ["無加糖", "無人工調味"],
    productMeta: "暖心濃湯",
    bulletPoints: ["無防腐劑"],
    productVariants: [],
    priceSignals: [],
    visualEvidence: {
      productTerms: ["南瓜濃湯"],
      claims: ["適合兩人分享"],
      specs: [],
      ocrFallback: []
    },
    screenshotCount: 0
  });

  assert.equal(summary.includes("圖片優點顯示"), false);
  assert.equal(summary.includes("條列優點包含"), false);
  assert.match(summary, /無加糖/);
  assert.match(summary, /適合兩人分享/);
});
