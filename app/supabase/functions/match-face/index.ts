// Supabase Edge Function: match-face
// Compares a provided embedding against stored embeddings and returns best match.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MatchResult = {
  matched: boolean;
  matched_user_id: string | null;
  score: number | null;
};

const cosineSimilarity = (a: number[], b: number[]) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const normalizeEmbedding = (value: unknown): number[] | null => {
  if (Array.isArray(value)) return value.map((v) => Number(v));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/^\[/, "").replace(/\]$/, "");
    if (!normalized) return null;
    return normalized.split(",").map((part) => Number(part.trim()));
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { embedding, claimed_user_id, redirect_to } = await req.json();
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid embedding" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: embeddings, error } = await supabase
      .from("face_embeddings")
      .select("user_id, embedding, is_active")
      .eq("is_active", true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let best: MatchResult = { matched: false, matched_user_id: null, score: null };
    let bestSimilarity = -1;
    const threshold = 0.4;

    for (const row of embeddings || []) {
      const candidate = normalizeEmbedding(row.embedding);
      if (!candidate || candidate.length !== embedding.length) continue;
      const similarity = cosineSimilarity(embedding, candidate);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        best = {
          matched: similarity >= threshold,
          matched_user_id: similarity >= threshold ? row.user_id : null,
          score: similarity,
        };
      }
    }

    let actionLink: string | null = null;
    let tokenHash: string | null = null;
    let matchedProfile: Record<string, unknown> | null = null;
    let userEmail: string | null = null;
    let userErrorMessage: string | null = null;
    let linkErrorMessage: string | null = null;
    if (best.matched && best.matched_user_id) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
        best.matched_user_id
      );

      userEmail = userData?.user?.email ?? null;
      if (userError) {
        userErrorMessage = userError.message;
      }

      if (!userError && userEmail) {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: userEmail,
          options: redirect_to ? { redirectTo: redirect_to } : undefined,
        });

        if (linkError) {
          linkErrorMessage = linkError.message;
        } else {
          const linkAny = linkData as Record<string, unknown> | null;
          const props = (linkAny?.properties as Record<string, unknown> | null) ?? null;
          actionLink =
            (props?.action_link as string | undefined) ??
            (linkAny?.action_link as string | undefined) ??
            null;
          tokenHash =
            (props?.hashed_token as string | undefined) ??
            (linkAny?.hashed_token as string | undefined) ??
            null;
        }
      } else if (!userEmail) {
        linkErrorMessage = "User email missing.";
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role, is_face_login_enabled")
        .eq("id", best.matched_user_id)
        .maybeSingle();
      matchedProfile = profileData ?? null;
    }

    const recognitionStatus = best.matched ? "match" : "no_match";
    await supabase.from("face_login_attempts").insert({
      claimed_user_id: claimed_user_id || null,
      matched_user_id: best.matched ? best.matched_user_id : null,
      recognition_status: recognitionStatus,
      similarity_score: best.score,
    });

    return new Response(
      JSON.stringify({
        ...best,
        action_link: actionLink,
        token_hash: tokenHash,
        matched_user: matchedProfile,
        user_email: userEmail,
        user_error: userErrorMessage,
        link_error: linkErrorMessage,
      }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
