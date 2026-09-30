// Import a recipe from a web page.
//
// POST { url } -> { name, description, ingredients[], steps[], image, totalMinutes, ease }
// Reads the schema.org Recipe JSON-LD that most recipe sites embed. Signed-in
// callers only (verify_jwt is on for this function). Nothing is written to the
// database; the app pre-fills the new-recipe form with the result.
//
// Errors carry a `code`. For "blocked", "not_found" and "unreachable" the app
// retries in an in-app browser on the phone (sites with bot protection block
// server fetches but not a real browser).

import { extractJsonLdBlocks, parseRecipeFromJsonLd } from "../_shared/recipeParser.js";

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
    return json({ error: "Please sign in.", code: "unauthorized" }, 401);
  }

  let url;
  try {
    const body = await req.json();
    url = new URL(String(body?.url ?? "").trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    return json({ error: "Please enter a valid web address.", code: "invalid_url" }, 400);
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
      return json({ error: "That site blocks importing from our server.", code: "blocked" }, 422);
    }
    if (!res.ok) return json({ error: `That page returned an error (${res.status}).`, code: "http_error" }, 422);
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return json({ error: "That page is too large to import.", code: "too_large" }, 422);
    html = new TextDecoder().decode(buffer);
  } catch {
    return json({ error: "Couldn't reach that page. Check the link and try again.", code: "unreachable" }, 422);
  }

  const recipe = parseRecipeFromJsonLd(extractJsonLdBlocks(html));
  if (!recipe) {
    return json({ error: "Couldn't find a recipe on that page.", code: "not_found" }, 422);
  }

  return json({ ...recipe, sourceUrl: url.toString() });
});
