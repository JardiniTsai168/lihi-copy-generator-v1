// Cloudflare Worker - Lihi Copy Generator
// Serve static + API proxy to Beck Copy Engine bridge

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const configuredEndpoint =
      typeof env.COPY_ENGINE_ENDPOINT === 'string' && env.COPY_ENGINE_ENDPOINT
        ? env.COPY_ENGINE_ENDPOINT
        : env.BECK_V1_ENDPOINT;
    const endpointBase = typeof configuredEndpoint === 'string' ? configuredEndpoint.replace(/\/+$/, '') : '';

    // API: health check
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'lihi-copy-generator',
        mode: endpointBase ? 'live' : 'mock',
        endpointMode: endpointBase ? 'live' : 'mock',
        engine: endpointBase ? 'beck-copy-engine' : 'mock'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // API: generate copy - proxy to bridge
    if (url.pathname === '/api/generate-copy' && request.method === 'POST') {
      if (!endpointBase) {
        // Mock fallback
        const body = await request.clone().json().catch(() => ({}));
        const productName = body.productName || '未指定產品';
        const productUrl = body.productUrl || '#';
        const tone = body.tone === 'conversion' ? 'conversion' : 'brand';
        const benefits = Array.isArray(body.benefits) ? body.benefits.filter(Boolean) : [];
        const fallbackTitle =
          tone === 'conversion'
            ? `${productName}，先把主賣點打到前面`
            : `${productName}，把產品價值講得更清楚`;
        const fallbackBody =
          tone === 'conversion'
            ? `${productName} 先把 ${benefits.slice(0, 3).join('、') || '核心賣點'} 拉到最前面，讓客戶更快理解差異與行動理由。`
            : `${productName} 會先整理頁面資訊，再把 ${benefits.slice(0, 3).join('、') || '核心賣點'} 組成一則更容易理解的客戶版廣告文案。`;

        return new Response(JSON.stringify({ 
          ok: true,
          mode: 'mock',
          provider: 'worker-fallback',
          prompt: '',
          masterDraft: {
            hook: fallbackTitle,
            audienceAngle: '',
            valueProp: fallbackBody,
            benefitPoints: benefits.slice(0, 3),
            proofPoints: [],
            cta: tone === 'conversion' ? '現在就查看' : '立即了解更多',
            toneNote: tone === 'conversion' ? '轉單型；平衡' : '品牌型；平衡',
            url: productUrl
          },
          output: {
            title: fallbackTitle,
            body: fallbackBody,
            cta: tone === 'conversion' ? '現在就查看' : '立即了解更多',
            url: productUrl
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        return await proxyBridgeRequest(request, env, endpointBase, '/generate-copy');
      } catch (err) {
        return new Response(JSON.stringify({
          ok: false,
          error: err.message,
          mode: 'error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/api/format-copy' && request.method === 'POST') {
      if (!endpointBase) {
        const body = await request.clone().json().catch(() => ({}));
        const fallbackOutput = {
          title: body?.masterDraft?.hook || body?.productName || '未指定產品',
          body: body?.masterDraft?.valueProp || '目前為 mock formatter 回應。',
          description: '',
          cta: body?.masterDraft?.cta || '立即了解更多',
          url: body?.productUrl || '#'
        };

        return new Response(JSON.stringify({
          ok: true,
          mode: 'mock',
          provider: 'worker-fallback',
          output: fallbackOutput
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        return await proxyBridgeRequest(request, env, endpointBase, '/format-copy');
      } catch (err) {
        return new Response(JSON.stringify({
          ok: false,
          error: err.message,
          mode: 'error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Static files via ASSETS binding
    if (url.pathname === '/') {
      return env.ASSETS.fetch(new Request(url.origin + '/index.html'));
    }
    
    return env.ASSETS.fetch(request);
  }
};

async function proxyBridgeRequest(request, env, endpointBase, bridgePath) {
  const body = await request.clone().json();
  const bridgeHeaders = { 'Content-Type': 'application/json' };
  if (env.COPY_ENGINE_API_KEY || env.BECK_V1_API_KEY) {
    bridgeHeaders.Authorization = `Bearer ${env.COPY_ENGINE_API_KEY || env.BECK_V1_API_KEY}`;
  }

  const bridgeResponse = await fetch(`${endpointBase}${bridgePath}`, {
    method: 'POST',
    headers: bridgeHeaders,
    body: JSON.stringify(body)
  });

  const rawBody = await bridgeResponse.text();
  const parsed = tryParseJsonResponse(rawBody, bridgeResponse.headers.get('content-type'));

  if (parsed.ok) {
    return new Response(JSON.stringify(parsed.value), {
      status: bridgeResponse.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fallbackStatus = bridgeResponse.ok ? 502 : bridgeResponse.status;
  return new Response(JSON.stringify({
    ok: false,
    error: 'upstream_invalid_response',
    message: buildUpstreamErrorMessage(rawBody, bridgeResponse.status)
  }), {
    status: fallbackStatus,
    headers: { 'Content-Type': 'application/json' }
  });
}

function tryParseJsonResponse(rawBody, contentType) {
  const normalizedContentType = String(contentType || '').toLowerCase();
  if (!normalizedContentType.includes('json')) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
}

function buildUpstreamErrorMessage(rawBody, status) {
  const text = String(rawBody || '').replace(/\s+/g, ' ').trim();
  if (text) {
    return `Bridge 回傳非 JSON 內容 (${status})：${text.slice(0, 240)}`;
  }

  return `Bridge 回傳非 JSON 內容 (${status})`;
}
