const APP_VERSION = "1.1.0";
const LIVE_MODES = new Set(["live", "proxy"]);
const TONE_LABELS = {
  warm: "溫和風格",
  aggressive: "aggressive 風格"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/api/health") {
      return withCors(
        jsonResponse({
          status: "ok",
          service: "lihi-copy-generator",
          version: APP_VERSION,
          endpointMode: getEndpointMode(env),
          beckV1Available: isLiveConfigured(env)
        })
      );
    }

    if (url.pathname === "/api/generate-copy" && request.method === "POST") {
      return withCors(await handleGenerateCopy(request, env));
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleGenerateCopy(request, env) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: "invalid_json", message: "Request body 必須是合法 JSON。" },
      400
    );
  }

  const normalized = normalizeInput(payload);
  const errors = validate(normalized);

  if (errors.length > 0) {
    return jsonResponse({ ok: false, error: "validation_failed", errors }, 400);
  }

  const prompt = buildPrompt(normalized);

  if (!isLiveConfigured(env)) {
    return jsonResponse({
      ok: true,
      mode: "mock",
      prompt,
      output: buildMockCopy(normalized)
    });
  }

  try {
    const output = await generateCopyWithEndpoint(normalized, prompt, env);
    return jsonResponse({
      ok: true,
      mode: "live",
      prompt,
      output
    });
  } catch (error) {
    console.error("Live endpoint failed, falling back to mock:", error);
    return jsonResponse({
      ok: true,
      mode: "mock",
      prompt,
      output: buildMockCopy(normalized),
      warning: "live_endpoint_failed"
    });
  }
}

function normalizeInput(payload) {
  return {
    productName: String(payload?.productName ?? payload?.product_name ?? "").trim(),
    benefits: Array.isArray(payload?.benefits)
      ? payload.benefits.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
    productUrl: String(payload?.productUrl ?? payload?.product_url ?? "").trim(),
    tone: String(payload?.tone ?? "").trim()
  };
}

function validate(data) {
  const errors = [];

  if (!data.productName || data.productName.length > 80) {
    errors.push("product_name 是必填欄位，且需在 80 字內");
  }

  if (data.benefits.length < 3 || data.benefits.length > 5) {
    errors.push("benefits 需要 3~5 項");
  }

  if (data.benefits.some((item) => item.length > 60)) {
    errors.push("每個 benefit 需在 60 字內");
  }

  if (!isValidUrl(data.productUrl)) {
    errors.push("product_url 必須是合法網址");
  }

  if (!Object.hasOwn(TONE_LABELS, data.tone)) {
    errors.push("tone 必須是 warm 或 aggressive");
  }

  return errors;
}

function buildPrompt(data) {
  const benefitsList = data.benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `你是「貝克 v1」，擅長整合行銷策略、受眾洞察、轉換導向寫作經驗，以及既有知識庫中的行銷相關資料，產出可直接使用的廣告文案。

請根據以下資訊，產出 1 則可直接使用的廣告文案：

產品名稱：${data.productName}
產品優點：
${benefitsList}

產品頁連結：${data.productUrl}
文案風格：${TONE_LABELS[data.tone]}

請遵守以下規則：
1. 文案要符合行銷用途，語氣自然、有說服力。
2. 需依照「貝克 v1」既有的行銷知識、經驗與已整理的行銷資料來生成。
3. 若風格是「溫和」，語氣要偏信任感、專業感、引導式溝通。
4. 若風格是「aggressive」，語氣要偏強烈、直接、促動行動，但不要低俗或過度誇大。
5. 不要產出多個版本，先只產出一個最佳版本。
6. 不要解釋你的思考過程，只輸出結果。

請用以下格式輸出：

標題：
主文：
CTA：
連結：`;
}

async function generateCopyWithEndpoint(data, prompt, env) {
  const controller = new AbortController();
  const timeoutMs = Number(env.BECK_V1_TIMEOUT_MS || 30000);
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const headers = {
      "content-type": "application/json"
    };
    const authHeader = env.BECK_V1_AUTH_HEADER || "authorization";

    if (env.BECK_V1_API_KEY) {
      headers[authHeader] = env.BECK_V1_API_KEY.startsWith("Bearer ")
        ? env.BECK_V1_API_KEY
        : `Bearer ${env.BECK_V1_API_KEY}`;
    }

    const response = await fetch(env.BECK_V1_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        product_name: data.productName,
        product_url: data.productUrl,
        benefits: data.benefits,
        tone: data.tone
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Endpoint returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const rawText = await response.text();
      return parseCopyOutput(rawText, data.productUrl);
    }

    const result = await response.json();

    if (result?.output && isStructuredCopy(result.output)) {
      return result.output;
    }

    if (isStructuredCopy(result)) {
      return result;
    }

    const rawText =
      result?.text || result?.message || result?.content || result?.output_text || "";

    if (rawText) {
      return parseCopyOutput(String(rawText), data.productUrl);
    }

    throw new Error("Endpoint response format is not supported");
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCopyOutput(rawOutput, defaultUrl) {
  const lines = String(rawOutput)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let title = "";
  let body = "";
  let cta = "";
  let url = defaultUrl;

  for (const line of lines) {
    if (line.startsWith("標題：")) {
      title = line.replace("標題：", "").trim();
      continue;
    }
    if (line.startsWith("主文：")) {
      body = line.replace("主文：", "").trim();
      continue;
    }
    if (line.startsWith("CTA：")) {
      cta = line.replace("CTA：", "").trim();
      continue;
    }
    if (line.startsWith("連結：")) {
      url = line.replace("連結：", "").trim() || defaultUrl;
    }
  }

  return {
    title: title || "讓你的產品亮點被看見",
    body: body || "結合產品優勢與行銷策略，打造可直接使用的高轉換文案。",
    cta: cta || "立即了解更多",
    url: isValidUrl(url) ? url : defaultUrl
  };
}

function buildMockCopy(data) {
  const toneData = {
    warm: {
      opening: "讓你的團隊",
      cta: "立即了解更多",
      style: "幫助你用更溫和的方式建立信任感"
    },
    aggressive: {
      opening: "現在就改變",
      cta: "馬上行動",
      style: "讓你能夠直接打動受眾，促成立即行動"
    }
  };

  const selected = toneData[data.tone] || toneData.warm;

  return {
    title: `${selected.opening}把產品亮點快速轉化成高轉換文案`,
    body: `${data.productName} 結合 ${data.benefits.slice(0, 2).join("、")}，${selected.style}。不需反覆修改，拿到就能用。`,
    cta: selected.cta,
    url: data.productUrl
  };
}

function isStructuredCopy(value) {
  return Boolean(
    value &&
      typeof value.title === "string" &&
      typeof value.body === "string" &&
      typeof value.cta === "string" &&
      typeof value.url === "string"
  );
}

function isLiveConfigured(env) {
  return Boolean(env.BECK_V1_ENDPOINT);
}

function getEndpointMode(env) {
  return LIVE_MODES.has("live") && isLiveConfigured(env) ? "live" : "mock";
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
