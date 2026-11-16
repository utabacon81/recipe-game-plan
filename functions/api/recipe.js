// Cloudflare Pages Function: GET /api/recipe?url=<recipe page>
// Fetches the page server side (browsers can't, because of CORS), finds the
// schema.org Recipe JSON-LD that most recipe sites embed, and returns only the
// recipe fields. It never returns the raw page.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

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

function findRecipe(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const r = findRecipe(node[k]);
    if (r) return r;
  }
  return null;
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

  let res;
  try {
    res = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
  } catch {
    return json({ error: "Couldn't reach that site." }, 502);
  }
  if (!res.ok) {
    return json(
      { error: `The site answered ${res.status}. It may block automated reads. Paste the recipe text instead.` },
      502
    );
  }

  const html = (await res.text()).slice(0, 4_000_000);
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

  let recipe = null;
  for (const b of blocks) {
    const text = b.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/;\s*$/, "");
    try {
      recipe = findRecipe(JSON.parse(text));
    } catch {
      recipe = null;
    }
    if (recipe) break;
  }
  if (!recipe) {
    return json({ error: "No recipe data found on that page. Paste the recipe text instead." }, 404);
  }

  return json({
    url: res.url,
    recipe: {
      name: recipe.name,
      recipeIngredient: recipe.recipeIngredient || recipe.ingredients || [],
      recipeInstructions: recipe.recipeInstructions || [],
      recipeYield: recipe.recipeYield,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      totalTime: recipe.totalTime,
    },
  });
}
