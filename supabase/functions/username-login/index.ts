
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Required authentication environment variables are missing.");
    return jsonResponse({ error: "Authentication service unavailable." }, 500);
  }

  try {
    const body = await req.json();
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (
      !username ||
      username.length > 100 ||
      !password ||
      password.length > 1024
    ) {
      return jsonResponse({ error: "Enter a valid username and password." }, 400);
    }

    // Use service-role access only on the server to resolve usernames.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Public-key client performs the actual password authentication.
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const normalizedUsername = username.toLowerCase();

    // Assumed schema:
    // staff(username, email, role, is_active)
    // members(username, email, is_active)
    const [staffResult, memberResult] = await Promise.all([
      admin
        .from("staff")
        .select("username,email,role,is_active")
        .eq("username", normalizedUsername)
        .limit(2),

      admin
        .from("members")
        .select("username,email,is_active")
        .eq("username", normalizedUsername)
        .limit(2),
    ]);

    if (staffResult.error || memberResult.error) {
      console.error("Username lookup failed.", {
        staffError: staffResult.error?.message,
        memberError: memberResult.error?.message,
      });

      return jsonResponse({ error: "Authentication service unavailable." }, 500);
    }

    const staffMatches = staffResult.data ?? [];
    const memberMatches = memberResult.data ?? [];

    // Fail closed if the username is missing or ambiguous.
    if (
      staffMatches.length + memberMatches.length !== 1
    ) {
      return jsonResponse({ error: "Invalid username or password." }, 401);
    }

    const isStaff = staffMatches.length === 1;
    const account = isStaff ? staffMatches[0] : memberMatches[0];

    if (account.is_active !== true) {
      return jsonResponse({ error: "Invalid username or password." }, 401);
    }

    const email =
      typeof account.email === "string" ? account.email.trim() : "";

    if (!email) {
      console.error("The matched account has no authentication email.");
      return jsonResponse({ error: "Authentication service unavailable." }, 500);
    }

    // The username is only an identifier. Supabase Auth verifies the password.
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return jsonResponse({ error: "Invalid username or password." }, 401);
    }

    // Verify the returned Auth identity matches the intended account email.
    if (data.user.email?.toLowerCase() !== email.toLowerCase()) {
      await authClient.auth.signOut();
      return jsonResponse({ error: "Invalid username or password." }, 401);
    }

    const role = isStaff
      ? (account.role as string)
      : "member";

    const allowedRoles = [
      "chairman",
      "manager",
      "treasurer",
      "bookkeeper",
      "inventory",
      "member",
    ];

    if (!allowedRoles.includes(role)) {
      await authClient.auth.signOut();
      return jsonResponse({ error: "This account has no valid portal role." }, 403);
    }

    // The client must establish this session using supabase.auth.setSession().
    return jsonResponse({
      session: data.session,
      user: {
        id: data.user.id,
        role,
        username: account.username,
      },
    });
  } catch (error) {
    console.error(
      "Username login failed unexpectedly.",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonResponse({ error: "Unable to sign in. Please try again." }, 500);
  }
});
