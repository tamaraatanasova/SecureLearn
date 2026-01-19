// Supabase Edge Function: create-user
// Allows admins/teachers to create new users securely using the service role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return json(401, { error: "Missing bearer token" });

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData?.user?.id) return json(401, { error: "Invalid session" });

  const callerId = callerData.user.id;
  const { data: callerProfile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle();

  if (profileError) return json(500, { error: profileError.message });

  const callerRole = String(callerProfile?.role || "student");
  if (callerRole !== "admin" && callerRole !== "teacher") {
    return json(403, { error: "Insufficient role" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (_err) {
    return json(400, { error: "Invalid JSON" });
  }

  const email = String(payload?.email || "").trim().toLowerCase();
  const password = String(payload?.password || "");
  const fullName = String(payload?.full_name || payload?.fullName || "").trim() || null;
  const requestedRole = String(payload?.role || "student").trim().toLowerCase();

  const allowedRoles = callerRole === "admin" ? ["student", "teacher", "admin"] : ["student", "teacher"];
  const role = allowedRoles.includes(requestedRole) ? requestedRole : "student";

  if (!email || !email.includes("@")) return json(400, { error: "Invalid email" });
  if (!password || password.length < 6) return json(400, { error: "Password must be at least 6 characters" });

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created?.user?.id) {
    return json(400, { error: createError?.message || "Failed to create user" });
  }

  const userId = created.user.id;
  const { error: profileUpsertError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role,
    },
    { onConflict: "id" }
  );

  if (profileUpsertError) {
    return json(500, { error: profileUpsertError.message, user_id: userId });
  }

  return json(200, { ok: true, user_id: userId, email, role });
});

