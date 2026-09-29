// Import a recipe from a web page.
//
// POST { url } -> { name, description, ingredients[], steps[], image, totalMinutes, ease }
// Reads the schema.org Recipe JSON-LD that most recipe sites embed. Signed-in
// callers only (verify_jwt is on for this function). Nothing is written to the
// database; the app pre-fills the new-recipe form with the result.

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const decodeEntities = (text) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const isRecipe = (node) => {
  const type = node?.["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
};

// JSON-LD may be a single object, an array, or wrapped in @graph.
const findRecipe = (node) => {
  if (!node || typeof node !== "object") return null;
  if (isRecipe(node)) return node;
  const children = Array.isArray(node) ? node : node["@graph"] ?? [];
  for (const child of children) {
    const found = findRecipe(child);
    if (found) return found;
  }
  return null;
};

const toText = (value) =>
  typeof value === "string" ? decodeEntities(value) : "";

// recipeInstructions: string | string[] | HowToStep[] | HowToSection[]
const flattenInstructions = (value) => {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/<\/(?:p|li)>|<br\s*\/?>|\n/i)
      .map(decodeEntities)
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (value.itemListElement) return flattenInstructions(value.itemListElement);
  if (value.text) return [toText(value.text)].filter(Boolean);
  if (value.name) return [toText(value.name)].filter(Boolean);
  return [];
};

const imageUrl = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageUrl(value[0]);
  return value.url ?? null;
};

// ISO 8601 duration, e.g. PT1H30M -> 90
const minutes = (value) => {
  if (typeof value !== "string") return null;
  const m = value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : null;
};

// Matches globals.js easeList: <15, 15-30, 30-60, >60 minutes
const easeFor = (total) =>
  total == null ? null : total < 15 ? 0 : total <= 30 ? 1 : total <= 60 ? 2 : 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // verify_jwt only checks the signature, and the public anon key is a valid JWT
  // too. The gateway has verified it, so the claims can be trusted here.
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role !== "authenticated") throw new Error();
  } catch {
    return json({ error: "Please sign in." }, 401);
  }

  let url;
  try {
    const body = await req.json();
    url = new URL(String(body?.url ?? "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    return json({ error: "Please enter a valid web address." }, 400);
  }

  let html;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SousRecipeImporter/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if ([401, 403, 429, 503].includes(res.status)) {
      return json({ error: "That site blocks importing. Add this recipe by hand, or try another site." }, 422);
    }
    if (!res.ok) return json({ error: `That page returned an error (${res.status}).` }, 422);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return json({ error: "That page is too large to import." }, 422);
    html = new TextDecoder().decode(buffer);
  } catch {
    return json({ error: "Couldn't reach that page. Check the link and try again." }, 422);
  }

  let recipe = null;
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, content] of scripts) {
    try {
      recipe = findRecipe(JSON.parse(content.trim()));
    } catch {
      // some sites emit invalid JSON-LD blocks; keep looking
    }
    if (recipe) break;
  }

  if (!recipe) {
    return json({ error: "Couldn't find a recipe on that page." }, 422);
  }

  const total = minutes(recipe.totalTime) ??
    ((minutes(recipe.prepTime) ?? 0) + (minutes(recipe.cookTime) ?? 0) || null);

  return json({
    name: toText(recipe.name),
    description: toText(recipe.description) || null,
    ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
      .map(toText)
      .filter(Boolean),
    steps: flattenInstructions(recipe.recipeInstructions),
    image: imageUrl(recipe.image),
    totalMinutes: total,
    ease: easeFor(total),
    sourceUrl: url.toString(),
  });
});
