// Cloudflare Pages Function: GET /api/recipe?url=<recipe page>
//
// Browsers can't read other sites directly (CORS), so this runs on Cloudflare.
// Many big recipe sites block requests from data centers, so it tries several
// routes in order and stops at the first one that yields a recipe:
//   1. The page itself, with full browser headers
//   2. The Internet Archive's copy of the page (raw HTML)
//   3. A reader service that loads the page in a real browser (HTML)
//   4. The same reader service as plain text, parsed by the app
// It only ever returns recipe fields or plain recipe text, never the raw page.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isRecipe(o) {
  const t = o && o["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item", "hasPart"]) {
    const r = findRecipe(node[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function stripTags(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function recipeFromHtml(html) {
  // 1. schema.org JSON-LD (most sites)
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    const text = b.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/;\s*$/, "");
    try {
      const r = findRecipe(JSON.parse(text));
      if (r) return r;
    } catch {
      /* keep looking */
    }
  }
  // 2. schema.org microdata (older sites)
  const grab = (prop) =>
    [...html.matchAll(new RegExp(`<([a-z0-9]+)[^>]*itemprop=["']${prop}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "gi"))]
      .map((m) => stripTags(m[2]))
      .filter(Boolean);
  const ings = grab("recipeIngredient").concat(grab("ingredients"));
  const steps = grab("recipeInstructions");
  if (ings.length && steps.length) {
    const name = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    return { name: name ? stripTags(name) : "", recipeIngredient: ings, recipeInstructions: steps };
  }
  return null;
}

function pick(recipe) {
  return {
    name: recipe.name,
    recipeIngredient: recipe.recipeIngredient || recipe.ingredients || [],
    recipeInstructions: recipe.recipeInstructions || [],
    recipeYield: recipe.recipeYield,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
  };
}

async function get(url, headers, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal, cf: { cacheTtl: 3600, cacheEverything: true } });
    const body = res.ok ? (await res.text()).slice(0, 5_000_000) : "";
    return { status: res.status, body, finalUrl: res.url };
  } catch (e) {
    return { status: 0, body: "", error: e.name === "AbortError" ? "timed out" : "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target;
  try {
    target = new URL(raw.trim());
  } catch {
    return json({ error: "That doesn't look like a web address." }, 400);
  }
  if (!/^https?:$/.test(target.protocol)) return json({ error: "Only http and https links work." }, 400);
  const url = target.toString();
  const tried = [];
  let title = "";
  const noteTitle = (html) => {
    if (title || !html) return;
    const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) title = stripTags(m[1]).replace(/\s*[|\-–]\s*[^|\-–]+$/, "").trim();
  };

  // 1. Direct
  {
    const r = await get(url, { ...BROWSER_HEADERS, referer: "https://www.google.com/" });
    noteTitle(r.body);
    const recipe = r.body && recipeFromHtml(r.body);
    tried.push({ via: "site", status: r.status || r.error, found: !!recipe });
    if (recipe) return json({ url: r.finalUrl || url, via: "site", recipe: pick(recipe), tried });
  }

  // 2. Internet Archive copy (raw HTML, "id_" skips the archive toolbar)
  {
    const r = await get(`https://web.archive.org/web/2026id_/${url}`, { "user-agent": UA }, 15000);
    noteTitle(r.body);
    const recipe = r.body && recipeFromHtml(r.body);
    tried.push({ via: "archive", status: r.status || r.error, found: !!recipe });
    if (recipe) return json({ url, via: "archive", recipe: pick(recipe), tried });
  }

  // 3. Reader service, full HTML from a real browser
  {
    const r = await get(`https://r.jina.ai/${url}`, { "x-return-format": "html", accept: "text/html" }, 20000);
    noteTitle(r.body);
    const recipe = r.body && recipeFromHtml(r.body);
    tried.push({ via: "reader", status: r.status || r.error, found: !!recipe });
    if (recipe) return json({ url, via: "reader", recipe: pick(recipe), tried });
  }

  // 4. Reader service as text; the app's paste parser takes it from here
  {
    const r = await get(`https://r.jina.ai/${url}`, { "x-return-format": "text", accept: "text/plain" }, 20000);
    const ok = r.body && /ingredient/i.test(r.body) && /(instruction|direction|method|step)/i.test(r.body);
    tried.push({ via: "reader-text", status: r.status || r.error, found: !!ok });
    if (ok) return json({ url, via: "reader-text", title, text: r.body.slice(0, 60000), tried });
  }

  return json(
    {
      error: "Couldn't read a recipe from that page. The site may block outside reads. Paste the recipe text instead.",
      tried,
    },
    502
  );
}
