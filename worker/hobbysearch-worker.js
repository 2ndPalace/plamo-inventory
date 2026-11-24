/**
 * ホビーサーチ (1999.co.jp) JAN照合プロキシ Cloudflare Worker
 * 対象サイトのボット対策で 403 / チャレンジ応答が返った場合は 502 を返します。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

function isBotBlocked(res, html) {
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    return true;
  }
  const lower = html.toLowerCase();
  if (
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-platform') ||
    lower.includes('just a moment...') ||
    lower.includes('access denied')
  ) {
    return true;
  }
  return false;
}

function extractFirstProductUrl(searchHtml) {
  // 例: href="/10123456" または href="https://www.1999.co.jp/10123456"
  const match = searchHtml.match(/href=["'](?:https?:\/\/www\.1999\.co\.jp)?(\/\d{6,10})(?:[/?#][^"']*)?["']/i);
  if (!match) return null;
  return `https://www.1999.co.jp${match[1]}`;
}

function extractProductFromJsonLd(html) {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const raw = JSON.parse(match[1].trim());
      const list = Array.isArray(raw) ? raw : raw['@graph'] ? raw['@graph'] : [raw];
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const typeVal = entry['@type'];
        const isProduct =
          typeVal === 'Product' || (Array.isArray(typeVal) && typeVal.includes('Product'));
        if (!isProduct) continue;

        const offers = Array.isArray(entry.offers) ? entry.offers[0] : entry.offers;
        const price = offers && offers.price !== undefined ? String(offers.price) : null;
        const image = Array.isArray(entry.image) ? entry.image[0] : entry.image;

        return {
          name: entry.name ? String(entry.name).trim() : null,
          price,
          imageUrl: image ? String(image).trim() : null
        };
      }
    } catch {
      // 不正なJSON-LDは無視して次のブロックへ
    }
  }
  return { name: null, price: null, imageUrl: null };
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLabelValue(html, labelPattern) {
  const regex = new RegExp(`${labelPattern}[\\s\\S]{0,160}?(<td[^>]*>[\\s\\S]*?<\\/td>|<dd[^>]*>[\\s\\S]*?<\\/dd>|<span[^>]*>[\\s\\S]*?<\\/span>|[:：]\\s*([A-Za-z0-9\\-_]+))`, 'i');
  const m = html.match(regex);
  if (!m) return null;
  const text = stripTags(m[2] || m[1] || '');
  const codeMatch = text.match(/[A-Za-z0-9][A-Za-z0-9\-_]{2,}/);
  return codeMatch ? codeMatch[0] : null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405);
    }

    const reqUrl = new URL(request.url);
    const jan = (reqUrl.searchParams.get('jan') || '').trim();
    if (!/^\d{8,14}$/.test(jan)) {
      return jsonResponse({ error: '有効なJANコード (8〜14桁の数字) を指定してください' }, 400);
    }

    try {
      const searchUrl = `https://www.1999.co.jp/search?searchkey=${encodeURIComponent(jan)}`;
      const searchRes = await fetch(searchUrl, { headers: BROWSER_HEADERS });
      const searchHtml = await searchRes.text();

      if (isBotBlocked(searchRes, searchHtml)) {
        return jsonResponse(
          { error: `対象サイトにボット対策でブロックされました (HTTP ${searchRes.status})` },
          502
        );
      }

      if (!searchRes.ok) {
        return jsonResponse({ error: `検索ページ取得失敗 (HTTP ${searchRes.status})` }, 502);
      }

      const productUrl = extractFirstProductUrl(searchHtml);
      if (!productUrl) {
        return jsonResponse({ error: '該当する商品ページが見つかりませんでした' }, 404);
      }

      const itemRes = await fetch(productUrl, { headers: BROWSER_HEADERS });
      const itemHtml = await itemRes.text();

      if (isBotBlocked(itemRes, itemHtml)) {
        return jsonResponse(
          { error: `商品ページでボット対策によりブロックされました (HTTP ${itemRes.status})` },
          502
        );
      }

      if (!itemRes.ok) {
        return jsonResponse({ error: `商品ページ取得失敗 (HTTP ${itemRes.status})` }, 502);
      }

      const ld = extractProductFromJsonLd(itemHtml);
      const extractedJan = extractLabelValue(itemHtml, 'JANコード') || jan;
      const extractedCode = extractLabelValue(itemHtml, '商品コード');

      if (!ld.name) {
        return jsonResponse({ error: '商品ページから商品名(JSON-LD)を抽出できませんでした' }, 502);
      }

      return jsonResponse({
        name: ld.name,
        price: ld.price,
        imageUrl: ld.imageUrl,
        sourceUrl: productUrl,
        jan: extractedJan,
        code: extractedCode
      });
    } catch (err) {
      return jsonResponse({ error: `プロキシ処理エラー: ${err.message || String(err)}` }, 502);
    }
  }
};
