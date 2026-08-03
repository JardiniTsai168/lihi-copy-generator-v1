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

    if (url.pathname === '/api/generate-creative' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const asset = buildCreativeAsset(body);

      return new Response(JSON.stringify({
        ok: true,
        mode: 'mock',
        provider: 'worker-creative-studio',
        asset
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
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

function buildCreativeAsset(body) {
  const platform = normalizeCreativePlatform(body?.platform);
  const platformMeta = getCreativePlatformMeta(platform);
  const style = normalizeCreativeStyle(body?.config?.style);
  const model = normalizeCreativeModel(body?.config?.model);
  const productName = String(body?.productName || '未命名產品').trim();
  const primaryCopy = String(body?.primaryCopy || '').trim();
  const sourceTitle = String(body?.source?.title || productName).trim();
  const sourceBody = String(body?.source?.body || primaryCopy || '').trim();
  const sourceCta = String(body?.source?.cta || '了解更多').trim();
  const prompt = buildCreativePrompt({
    platform,
    platformMeta,
    style,
    model,
    productName,
    primaryCopy,
    sourceTitle,
    sourceBody
  });
  const imageUrl = buildCreativeSvgDataUrl({
    platformMeta,
    style,
    model,
    productName,
    sourceTitle,
    sourceBody,
    sourceCta
  });

  return {
    platform,
    platformLabel: platformMeta.label,
    sizeLabel: `${platformMeta.width} × ${platformMeta.height}`,
    style,
    model,
    prompt,
    imageUrl,
    alt: `${productName} ${platformMeta.label} 素材預覽`
  };
}

function normalizeCreativePlatform(value) {
  return ['facebook', 'instagram', 'threads', 'google_ads'].includes(value) ? value : 'facebook';
}

function normalizeCreativeStyle(value) {
  return ['clean', 'editorial', 'bold', 'warm', 'luxury'].includes(value) ? value : 'clean';
}

function normalizeCreativeModel(value) {
  return ['none', 'adult', 'family', 'hand'].includes(value) ? value : 'none';
}

function getCreativePlatformMeta(platform) {
  switch (platform) {
    case 'instagram':
      return { label: 'IG', width: 1080, height: 1350 };
    case 'threads':
      return { label: 'Threads', width: 1080, height: 1920 };
    case 'google_ads':
      return { label: 'Google Ads', width: 1200, height: 628 };
    case 'facebook':
    default:
      return { label: 'Facebook 主圖', width: 1200, height: 600 };
  }
}

function buildCreativePrompt({ platformMeta, style, model, productName, primaryCopy, sourceTitle, sourceBody }) {
  const styleMap = {
    clean: '清爽產品感，畫面乾淨、聚焦單一主賣點、保留品牌留白',
    editorial: '質感編輯感，像品牌專題封面，構圖有節奏與高級感',
    bold: '高轉換吸睛版，主標明確、視覺對比強、適合廣告投放',
    warm: '溫暖生活感，強調生活情境與柔和氛圍',
    luxury: '高級品牌版，克制、精緻、深色與粉色點綴'
  };
  const modelMap = {
    none: '不要模特兒，以產品與版面為主',
    adult: '可加入單一生活感模特兒，但不要搶走主產品',
    family: '可加入家庭互動感模特兒，傳遞分享氛圍',
    hand: '只加入手部互動，讓畫面更有使用情境'
  };

  return [
    `請根據以下主文案，產出一張 ${platformMeta.width}x${platformMeta.height} 的 ${platformMeta.label} 廣告素材。`,
    `產品名稱：${productName}`,
    `主標重點：${sourceTitle}`,
    `文案內容：${primaryCopy || sourceBody || sourceTitle}`,
    `視覺風格：${styleMap[style]}`,
    `模特兒設定：${modelMap[model]}`,
    '請保留清楚標題層級、品牌感與廣告可讀性，不要自行發明新的賣點。'
  ].join('\n');
}

function buildCreativeSvgDataUrl({ platformMeta, style, model, productName, sourceTitle, sourceBody, sourceCta }) {
  const palette = getCreativePalette(style);
  const headline = escapeHtml(truncateText(sourceTitle || productName, platformMeta.width > 1100 ? 34 : 24));
  const body = escapeHtml(truncateText(compactCreativeText(sourceBody || ''), platformMeta.height > 1000 ? 120 : 78));
  const cta = escapeHtml(truncateText(sourceCta || '了解更多', 14));
  const product = escapeHtml(truncateText(productName, 24));
  const modelBadge = model === 'none' ? '' : `<text x="${platformMeta.width - 64}" y="92" text-anchor="end" font-size="28" fill="${palette.badgeText}" font-family="Avenir Next, Noto Sans TC, sans-serif">MODEL ON</text>`;
  const visualAccent = buildCreativeAccent(platformMeta, palette, model);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${platformMeta.width}" height="${platformMeta.height}" viewBox="0 0 ${platformMeta.width} ${platformMeta.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.bgStart}" />
          <stop offset="100%" stop-color="${palette.bgEnd}" />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.panelStart}" />
          <stop offset="100%" stop-color="${palette.panelEnd}" />
        </linearGradient>
      </defs>
      <rect width="${platformMeta.width}" height="${platformMeta.height}" fill="url(#bg)" rx="28" />
      <circle cx="${platformMeta.width * 0.16}" cy="${platformMeta.height * 0.18}" r="${platformMeta.width * 0.13}" fill="${palette.glowA}" />
      <circle cx="${platformMeta.width * 0.84}" cy="${platformMeta.height * 0.2}" r="${platformMeta.width * 0.18}" fill="${palette.glowB}" />
      <rect x="48" y="48" width="${platformMeta.width - 96}" height="${platformMeta.height - 96}" rx="34" fill="url(#panel)" stroke="${palette.border}" />
      ${visualAccent}
      <text x="88" y="104" font-size="28" letter-spacing="5" fill="${palette.overline}" font-family="Avenir Next, Noto Sans TC, sans-serif">LIHI CREATIVE</text>
      ${modelBadge}
      <text x="88" y="${platformMeta.height > 1000 ? 250 : 208}" font-size="${platformMeta.height > 1000 ? 92 : 62}" font-weight="800" fill="${palette.headline}" font-family="Avenir Next, Noto Sans TC, sans-serif">${headline}</text>
      <foreignObject x="88" y="${platformMeta.height > 1000 ? 320 : 250}" width="${platformMeta.width * 0.52}" height="${platformMeta.height * 0.34}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Avenir Next, 'Noto Sans TC', sans-serif; color: ${palette.body}; font-size: ${platformMeta.height > 1000 ? 40 : 28}px; line-height: 1.55; white-space: pre-wrap;">${body}</div>
      </foreignObject>
      <rect x="88" y="${platformMeta.height - 142}" width="${platformMeta.width > 1100 ? 220 : 200}" height="64" rx="32" fill="${palette.ctaBg}" />
      <text x="${platformMeta.width > 1100 ? 198 : 188}" y="${platformMeta.height - 100}" text-anchor="middle" font-size="28" font-weight="700" fill="${palette.ctaText}" font-family="Avenir Next, Noto Sans TC, sans-serif">${cta}</text>
      <text x="88" y="${platformMeta.height - 34}" font-size="26" fill="${palette.product}" font-family="Avenir Next, Noto Sans TC, sans-serif">${product}</text>
    </svg>
  `.replace(/\n\s+/g, ' ').trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildCreativeAccent(platformMeta, palette, model) {
  const base = `
    <rect x="${platformMeta.width * 0.62}" y="${platformMeta.height * 0.18}" width="${platformMeta.width * 0.24}" height="${platformMeta.height * 0.52}" rx="28" fill="${palette.card}" stroke="${palette.border}" />
    <circle cx="${platformMeta.width * 0.74}" cy="${platformMeta.height * 0.34}" r="${platformMeta.width * 0.07}" fill="${palette.cardAccent}" />
    <rect x="${platformMeta.width * 0.66}" y="${platformMeta.height * 0.48}" width="${platformMeta.width * 0.16}" height="${platformMeta.height * 0.05}" rx="18" fill="${palette.cardAccentSoft}" />
    <rect x="${platformMeta.width * 0.66}" y="${platformMeta.height * 0.56}" width="${platformMeta.width * 0.12}" height="${platformMeta.height * 0.05}" rx="18" fill="${palette.cardAccentSoft}" />
  `;

  if (model === 'none') {
    return base;
  }

  return `
    ${base}
    <circle cx="${platformMeta.width * 0.78}" cy="${platformMeta.height * 0.5}" r="${platformMeta.width * 0.045}" fill="${palette.modelSkin}" />
    <rect x="${platformMeta.width * 0.73}" y="${platformMeta.height * 0.55}" width="${platformMeta.width * 0.1}" height="${platformMeta.height * 0.12}" rx="30" fill="${palette.modelOutfit}" />
  `;
}

function getCreativePalette(style) {
  const palettes = {
    clean: {
      bgStart: '#FFF5F8',
      bgEnd: '#FFE1EC',
      panelStart: '#FFFFFF',
      panelEnd: '#FFF8FB',
      border: 'rgba(26,26,94,0.10)',
      glowA: 'rgba(255,107,157,0.26)',
      glowB: 'rgba(26,26,94,0.12)',
      overline: '#FF4D88',
      headline: '#1A1A5E',
      body: '#34346B',
      ctaBg: '#1A1A5E',
      ctaText: '#FFFFFF',
      product: '#FF4D88',
      badgeText: '#1A1A5E',
      card: '#FFF2F7',
      cardAccent: '#FF6B9D',
      cardAccentSoft: '#FFD0E0',
      modelSkin: '#F3C7AC',
      modelOutfit: '#1A1A5E'
    },
    editorial: {
      bgStart: '#F7F4FF',
      bgEnd: '#E7E1FF',
      panelStart: '#FFFFFF',
      panelEnd: '#F4F0FF',
      border: 'rgba(26,26,94,0.10)',
      glowA: 'rgba(125,93,255,0.22)',
      glowB: 'rgba(255,107,157,0.16)',
      overline: '#7D5DFF',
      headline: '#17174D',
      body: '#37376F',
      ctaBg: '#7D5DFF',
      ctaText: '#FFFFFF',
      product: '#1A1A5E',
      badgeText: '#7D5DFF',
      card: '#EFEAFF',
      cardAccent: '#7D5DFF',
      cardAccentSoft: '#D8D0FF',
      modelSkin: '#EFC1A6',
      modelOutfit: '#7D5DFF'
    },
    bold: {
      bgStart: '#1A1A5E',
      bgEnd: '#2A1458',
      panelStart: '#2B2B78',
      panelEnd: '#16164A',
      border: 'rgba(255,255,255,0.12)',
      glowA: 'rgba(255,107,157,0.32)',
      glowB: 'rgba(255,214,10,0.18)',
      overline: '#FFB8CF',
      headline: '#FFFFFF',
      body: '#F8EAF0',
      ctaBg: '#FF6B9D',
      ctaText: '#FFFFFF',
      product: '#FFD9E6',
      badgeText: '#FFD9E6',
      card: '#FF6B9D',
      cardAccent: '#FFD54F',
      cardAccentSoft: '#FF95B8',
      modelSkin: '#F1C5AA',
      modelOutfit: '#FFD54F'
    },
    warm: {
      bgStart: '#FFF6EE',
      bgEnd: '#FFE9DC',
      panelStart: '#FFFFFF',
      panelEnd: '#FFF8F1',
      border: 'rgba(26,26,94,0.08)',
      glowA: 'rgba(255,153,111,0.22)',
      glowB: 'rgba(255,107,157,0.14)',
      overline: '#C86D4A',
      headline: '#1A1A5E',
      body: '#4D4D74',
      ctaBg: '#FF6B9D',
      ctaText: '#FFFFFF',
      product: '#C86D4A',
      badgeText: '#C86D4A',
      card: '#FFF0E4',
      cardAccent: '#FFA36F',
      cardAccentSoft: '#FFD3B9',
      modelSkin: '#F1C5AA',
      modelOutfit: '#FF6B9D'
    },
    luxury: {
      bgStart: '#101038',
      bgEnd: '#1A1A5E',
      panelStart: '#17174A',
      panelEnd: '#0F0F34',
      border: 'rgba(255,255,255,0.12)',
      glowA: 'rgba(255,107,157,0.2)',
      glowB: 'rgba(255,255,255,0.08)',
      overline: '#FF9CBD',
      headline: '#FFF7FB',
      body: '#EADCE3',
      ctaBg: '#FFF5F8',
      ctaText: '#1A1A5E',
      product: '#FF9CBD',
      badgeText: '#FFB8CF',
      card: '#252567',
      cardAccent: '#FF6B9D',
      cardAccentSoft: '#45458C',
      modelSkin: '#EAB89A',
      modelOutfit: '#FFF5F8'
    }
  };

  return palettes[style] || palettes.clean;
}

function compactCreativeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
  const chars = Array.from(String(value || '').trim());
  if (chars.length <= maxLength) {
    return chars.join('');
  }
  return `${chars.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
