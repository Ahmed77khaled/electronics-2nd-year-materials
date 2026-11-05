import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServerSecret(): string | null {
  const legacyServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyServiceRole) return legacyServiceRole;

  // New Supabase projects expose named secret API keys to Edge Functions.
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;

  try {
    const parsed = JSON.parse(secretKeys);
    return typeof parsed.default === "string" ? parsed.default : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serverSecret = getServerSecret();
  if (!supabaseUrl || !serverSecret) {
    console.error("Missing Supabase URL or server-side secret key.");
    return jsonResponse({ error: "إعدادات خدمة حذف المستخدم غير مكتملة." }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse({ error: "يلزم تسجيل الدخول بحساب مشرف." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serverSecret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Validate the caller's JWT with Supabase Auth. Never trust a role sent by the browser.
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(tokenMatch[1]);
  const caller = callerData?.user;
  if (callerError || !caller) {
    return jsonResponse({ error: "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." }, 401);
  }

  const { data: callerAdmin, error: callerRoleError } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (callerRoleError) {
    console.error("Could not verify administrator role:", callerRoleError.message);
    return jsonResponse({ error: "تعذّر التحقق من صلاحيات المشرف." }, 500);
  }
  if (!callerAdmin) {
    return jsonResponse({ error: "ليس لديك صلاحية حذف المستخدمين." }, 403);
  }

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "بيانات الطلب غير صالحة." }, 400);
  }

  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(targetUserId)) {
    return jsonResponse({ error: "معرّف المستخدم غير صالح." }, 400);
  }

  if (targetUserId === caller.id) {
    return jsonResponse({ error: "لا يمكنك حذف حساب المشرف الذي تستخدمه حاليًا." }, 409);
  }

  // Admin accounts are protected; this endpoint only removes student accounts.
  const { data: targetAdmin, error: targetRoleError } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetRoleError) {
    console.error("Could not inspect target role:", targetRoleError.message);
    return jsonResponse({ error: "تعذّر التحقق من نوع الحساب المطلوب." }, 500);
  }
  if (targetAdmin) {
    return jsonResponse({ error: "لا يمكن حذف حساب مشرف من هذه الشاشة." }, 409);
  }

  const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(targetUserId);
  if (targetError || !targetData?.user) {
    return jsonResponse({ error: "المستخدم غير موجود أو تم حذفه بالفعل." }, 404);
  }

  // Hard-delete the Auth user. Supabase cascades the linked profile and its
  // student sessions/activity through the existing foreign-key relationships.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId, false);
  if (deleteError) {
    console.error("Auth user deletion failed:", deleteError.message);
    const message = /storage|object|owner/i.test(deleteError.message)
      ? "لا يمكن حذف الحساب لأنه يمتلك ملفات في Supabase Storage. انقل الملفات أو احذفها أولًا."
      : "تعذّر حذف الحساب. حاول مرة أخرى أو راجع سجلات Supabase.";
    return jsonResponse({ error: message }, 409);
  }

  return jsonResponse({ success: true, deletedUserId: targetUserId });
});
