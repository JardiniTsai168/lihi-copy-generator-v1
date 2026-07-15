const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const ENDPOINT = process.env.BECK_V1_ENDPOINT || "";
const API_KEY = process.env.BECK_V1_API_KEY || "";
const OPENCLAW_AGENT_ID = process.env.OPENCLAW_AGENT_ID || "beck-v1";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const MODE = process.env.BECK_V1_MODE || "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validatePayload(payload) {
  const errors = {};
  const productName = typeof payload.productName === "string" ? payload.productName.trim() : "";
  const rawBenefits = Array.isArray(payload.benefits) ? payload.benefits : [];
  const benefits = rawBenefits
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  const productUrl = typeof payload.productUrl === "string" ? payload.productUrl.trim() : "";
  const tone = typeof payload.tone === "string" ? payload.tone.trim() : "";

  if (!productName || productName.length > 80) {
    errors.productName = "產品名稱必填，且需在 80 字內。";
  }

  if (benefits.length < 3 || benefits.length > 5) {
    errors.benefits = "請提供 3 到 5 個產品優點。";
  } else if (benefits.some((item) => item.length > 60)) {
    errors.benefits = "每個優點需在 60 字內。";
  }

  try {
    new URL(productUrl);
  } catch {
    errors.productUrl = "請輸入有效的產品頁連結。";
  }

  if (!["warm", "aggressive"].includes(tone)) {
    errors.tone = "文案風格只能是 warm 或 aggressive。";
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      productName,
      benefits,
      productUrl,
      tone
    }
  };
}

function buildPrompt({ productName, benefits, productUrl, tone }) {
  const toneRule =
    tone === "warm"
      ? "語氣偏溫和、專業、可信任，強調價值、理解使用者需求、降低壓迫感。"
      : "語氣偏直接、強烈、促動行動，強調機會、差異、效率與立即行動，但不能低俗、浮誇或不實承諾。";

  const benefitLines = benefits.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `你是「貝克 v1」，擅長整合行銷策略、受眾洞察、轉換導向寫作經驗，以及既有知識庫中的行銷相關資料，產出可直接使用的廣告文案。

任務：
根據使用者提供的產品資訊，產出 1 則可直接使用的廣告文案。

輸入資料：
- 產品名稱：${productName}
- 產品優點：
${benefitLines}
- 產品頁連結：${productUrl}
- 文案風格：${tone}

風格規則：
- ${toneRule}

生成規則：
1. 必須結合使用者提供的產品名稱、產品優點、產品頁資訊，以及貝克 v1 的既有行銷知識與過往餵入的行銷資料脈絡。
2. 優先考慮清楚、可用、具說服力，避免空泛形容詞堆疊。
3. 不要輸出多個版本，不要解釋思考過程，不要輸出分析、備註、前言、後記。
4. 不要捏造未提供的具體數字、成效、保證。

請嚴格按照以下格式輸出：
標題：{title}
主文：{body}
CTA：{cta}
連結：{product_url}`;
}

function buildMockCopy({ productName, benefits, productUrl, tone }) {
  const primary = benefits[0];
  const secondary = benefits[1];
  const tertiary = benefits[2];
  const title =
    tone === "warm"
      ? `${productName}，把${primary}做得更自然`
      : `${productName}，現在就用${primary}拉開差距`;

  const body =
    tone === "warm"
      ? `${productName} 聚焦 ${primary}、${secondary} 與 ${tertiary}，幫助行銷人更穩定地把產品價值說清楚。當你需要一則更容易被理解、也更容易被採取行動的廣告文案，這會是更省力的起點。`
      : `如果你正在找一個能把 ${primary}、${secondary}、${tertiary} 一次講到位的做法，${productName} 就是你該直接推上檯面的選擇。少一點模糊，多一點轉換，把注意力快速變成行動。`;

  const cta = tone === "warm" ? "立即了解更多" : "現在就立刻查看";

  return {
    title,
    body,
    cta,
    url: productUrl
  };
}

function normalizeAgentResponse(data, fallbackUrl) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.title && data.body && data.cta) {
    return {
      title: String(data.title).trim(),
      body: String(data.body).trim(),
      cta: String(data.cta).trim(),
      url: String(data.url || fallbackUrl).trim()
    };
  }

  if (data.output && typeof data.output === "object") {
    return normalizeAgentResponse(data.output, fallbackUrl);
  }

  if (Array.isArray(data.content)) {
    const textChunk = data.content.find((item) => item && typeof item.text === "string");
    if (textChunk) {
      return parseStructuredText(textChunk.text, fallbackUrl);
    }
  }

  if (typeof data.text === "string") {
    return parseStructuredText(data.text, fallbackUrl);
  }

  return null;
}

function parseStructuredText(text, fallbackUrl) {
  const lines = text.split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    const [label, ...rest] = line.split("：");
    if (!rest.length) {
      continue;
    }
    const value = rest.join("：").trim();
    if (label === "標題") {
      result.title = value;
    } else if (label === "主文") {
      result.body = value;
    } else if (label === "CTA") {
      result.cta = value;
    } else if (label === "連結") {
      result.url = value;
    }
  }

  if (result.title && result.body && result.cta) {
    result.url = result.url || fallbackUrl;
    return result;
  }

  return null;
}

async function requestBeckV1(data) {
  const prompt = buildPrompt(data);

  if (MODE === "openclaw") {
    const output = await requestViaOpenClaw(prompt, data.productUrl);
    return {
      mode: "openclaw",
      prompt,
      output
    };
  }

  if (!ENDPOINT) {
    return {
      mode: "mock",
      prompt,
      output: buildMockCopy(data)
    };
  }

  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const payload = {
    input: data,
    prompt
  };

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Agent request failed with status ${response.status}`);
  }

  const result = await response.json();
  const normalized = normalizeAgentResponse(result, data.productUrl);
  if (!normalized) {
    throw new Error("Agent response format is invalid");
  }

  return {
    mode: "live",
    prompt,
    output: normalized
  };
}

function requestViaOpenClaw(prompt, fallbackUrl) {
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    const child = spawn(
      OPENCLAW_BIN,
      ["agent", "--agent", OPENCLAW_AGENT_ID, "--message", prompt, "--json"],
      {
        cwd: __dirname,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `OpenClaw agent failed with code ${code}`));
        return;
      }

      try {
        const jsonStart = stdout.indexOf("{");
        const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
        const parsed = JSON.parse(jsonText);
        const text =
          parsed?.result?.payloads?.[0]?.text ||
          parsed?.result?.finalAssistantVisibleText ||
          parsed?.reply?.text ||
          parsed?.result?.reply?.text ||
          parsed?.message ||
          "";
        const normalized = normalizeAgentResponse({ text }, fallbackUrl);
        if (!normalized) {
          reject(new Error("OpenClaw agent response format is invalid"));
          return;
        }
        resolve(normalized);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveFile(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    const endpointMode = MODE === "openclaw" ? "openclaw" : ENDPOINT ? "live" : "mock";
    sendJson(res, 200, { ok: true, endpointMode });
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-copy") {
    try {
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const validation = validatePayload(payload);

      if (!validation.ok) {
        sendJson(res, 422, { ok: false, errors: validation.errors });
        return;
      }

      const result = await requestBeckV1(validation.data);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message || "Unknown error"
      });
    }
    return;
  }

  if (req.method === "GET") {
    serveFile(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`lihi copy generator running at http://localhost:${PORT}`);
});
