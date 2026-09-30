// Embed recipes for taste-based suggestions, using Supabase's built-in
// gte-small model (runs inside the edge runtime: no external API or key).
//
// POST { recipe_id }   signed-in user: embeds that recipe if the caller can see it.
// POST { backfill: true, limit? }   service role only: embeds up to `limit`
//   (default 15, max 25) recipes missing one; call again until it returns 0.
//   Small batches keep within the edge worker's compute limit.
//
// Returns { embedded: n }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const model = new Supabase.ai.Session("gte-small");

// ingredients have been stored as a jsonb array and as a JSON-encoded string
const ingredientList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch {
      return [value];
    }
  }
  return [];
};

const recipeText = (recipe) =>
  [
    recipe.name,
    recipe.description,
    ingredientList(recipe.ingredients).filter(Boolean).join(", "),
  ].filter(Boolean).join(". ");

const embedAndSave = async (recipe) => {
  const vector = await model.run(recipeText(recipe), { mean_pool: true, normalize: true });
  const { error } = await admin
    .from("recipes")
    .update({ embedding: JSON.stringify(vector), embedded_at: new Date().toISOString() })
    .eq("id", recipe.id);
  if (error) throw error;
};

// verify_jwt has checked the signature; read the role claim.
const callerRole = (req) => {
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const role = callerRole(req);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }

  try {
    if (body?.backfill) {
      if (role !== "service_role") return json({ error: "Forbidden" }, 403);
      const { data: recipes, error } = await admin
        .from("recipes")
        .select("id, name, description, ingredients")
        .is("embedding", null)
        .limit(Math.min(Math.max(Number(body.limit) || 15, 1), 25));
      if (error) throw error;
      for (const recipe of recipes) await embedAndSave(recipe);
      return json({ embedded: recipes.length });
    }

    if (role !== "authenticated") return json({ error: "Please sign in." }, 401);
    const recipeId = Number(body?.recipe_id);
    if (!Number.isInteger(recipeId)) return json({ error: "recipe_id required" }, 400);

    // Read as the caller, so RLS decides whether they can see the recipe.
    const asCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") } },
      auth: { persistSession: false },
    });
    const { data: recipe, error } = await asCaller
      .from("recipes")
      .select("id, name, description, ingredients")
      .eq("id", recipeId)
      .maybeSingle();
    if (error) throw error;
    if (!recipe) return json({ error: "Recipe not found" }, 404);

    await embedAndSave(recipe);
    return json({ embedded: 1 });
  } catch (error) {
    console.error(error);
    return json({ error: "Could not embed recipe" }, 500);
  }
});
