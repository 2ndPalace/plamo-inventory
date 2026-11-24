/**
 * ホビーサーチ (1999.co.jp) JAN照合プロキシ Cloudflare Worker v2
 *
 * v1 は対象サイトへ直接 fetch していたが、ボット対策で 403 になったため、
 * v2 では読み取り専用プロキシ (r.jina.ai) 経由で検索ページの Markdown を取得し、
 * 商品名・商品コード・価格を抽出する。ブロック/混雑時は捏造せずエラーを返す。
 * 無料枠のレート制限に当たった場合は 1 回だけ自動で再試行する。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
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

async function fetchMarkdownViaReader(targetUrl) {
  const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
    headers: { Accept: 'text/plain' }
  });
  const text = await res.text();
  return { res, text };
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

    const searchUrl = `https://www.1999.co.jp/search?searchkey=${encodeURIComponent(jan)}`;

    try {
      let md = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { res, text } = await fetchMarkdownViaReader(searchUrl);
        if (res.status === 429 || text.includes('RateLimitTriggeredError')) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 3500));
            continue;
          }
          return jsonResponse(
            { error: '読み取りプロキシが混み合っています。少し待ってから再試行してください' },
            502
          );
        }
        if (!res.ok) {
          return jsonResponse({ error: `読み取りプロキシ取得失敗 (HTTP ${res.status})` }, 502);
        }
        md = text;
        break;
      }

      if (!md || md.includes('Just a moment') || md.includes('cf-browser-verification')) {
        return jsonResponse({ error: '対象サイトにボット対策でブロックされました' }, 502);
      }

      const titleMatch = md.match(/^Title:\s*(.+)$/m);
      let name = titleMatch
        ? titleMatch[1].replace(/\s*-\s*ホビーサーチ.*$/, '').trim()
        : null;
      if (name && /検索|search/i.test(name)) name = null;

      const finalUrlMatch = md.match(/^Final URL:\s*(\S+)$/m);
      const codeMatch = md.match(/商品コード\s*([A-Za-z0-9][A-Za-z0-9\-]*)/);
      const priceMatch = md.match(/販売価格\s*¥([\d,]+)/);
      const janMatch = md.match(/JANコード\s*(\d{8,14})/);
      let sourceUrl = finalUrlMatch ? finalUrlMatch[1] : searchUrl;

      if (!name) {
        // 検索結果が複数件の場合は、最初の商品リンクを候補にする
        const linkMatch = md.match(/\[([^\]]{3,80})\]\((https:\/\/www\.1999\.co\.jp\/\d{6,10})\)/);
        if (linkMatch) {
          name = linkMatch[1].trim();
          sourceUrl = linkMatch[2];
        }
      }

      if (!name) {
        return jsonResponse({ error: '該当する商品が見つからないか、商品名を抽出できませんでした' }, 404);
      }

      return jsonResponse({
        name,
        price: priceMatch ? priceMatch[1].replace(/,/g, '') : null,
        imageUrl: null,
        sourceUrl,
        jan: janMatch ? janMatch[1] : jan,
        code: codeMatch ? codeMatch[1] : null
      });
    } catch (err) {
      return jsonResponse({ error: `プロキシ処理エラー: ${err.message || String(err)}` }, 502);
    }
  }
};
