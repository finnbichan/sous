// Reads a schema.org Recipe from JSON-LD. Shared by the import-recipe edge
// function (server fetch) and the app's in-app browser import, so both produce
// the same result. Plain JS with no runtime-specific APIs (runs in Deno and
// React Native).
//
// Result: { name, description, ingredients[], steps[], image, totalMinutes, ease }

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

// Contents of every <script type="application/ld+json"> block in an HTML page.
export const extractJsonLdBlocks = (html) =>
  [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, content]) => content.trim());

// First Recipe found in the given JSON-LD block strings, normalised; or null.
export const parseRecipeFromJsonLd = (blocks) => {
  let recipe = null;
  for (const content of blocks) {
    try {
      recipe = findRecipe(JSON.parse(content));
    } catch {
      // some sites emit invalid JSON-LD blocks; keep looking
    }
    if (recipe) break;
  }
  if (!recipe) return null;

  const total = minutes(recipe.totalTime) ??
    ((minutes(recipe.prepTime) ?? 0) + (minutes(recipe.cookTime) ?? 0) || null);

  return {
    name: toText(recipe.name),
    description: toText(recipe.description) || null,
    ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
      .map(toText)
      .filter(Boolean),
    steps: flattenInstructions(recipe.recipeInstructions),
    image: imageUrl(recipe.image),
    totalMinutes: total,
    ease: easeFor(total),
  };
};
