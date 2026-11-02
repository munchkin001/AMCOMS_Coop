import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const operationTypes = new Set([
  "inventory_movement",
  "member_contact_update",
  "member_financial_entry",
  "cash_receipt",
  "cash_disbursement",
  "cash_receipt_delete",
  "cash_disbursement_delete",
  "cooperative_sale",
  "member_dividend",
  "transaction_workflow",
  "loan_application",
  "bookkeeper_loan_application",
  "production_record",
  "journal_entry",
  "journal_reversal",
]);
const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json(
      { error: "Authentication required" },
      { status: 401, headers: corsHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return Response.json(
      { error: "Server configuration is incomplete" },
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json(
      { error: "Invalid or expired session" },
      { status: 401, headers: corsHeaders },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { error: "A JSON object is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const operation = body as Record<string, unknown>;
  if (
    typeof operation.operationId !== "string" ||
    !operationIdPattern.test(operation.operationId) ||
    typeof operation.type !== "string" ||
    !operationTypes.has(operation.type) ||
    typeof operation.payload !== "object" ||
    operation.payload === null ||
    Array.isArray(operation.payload)
  ) {
    return Response.json(
      { error: "Unsupported or invalid offline operation" },
      { status: 400, headers: corsHeaders },
    );
  }

  const { data, error } = operation.type === "bookkeeper_loan_application"
    ? await supabase.rpc("sync_bookkeeper_loan_application", {
      p_operation_id: operation.operationId,
      p_payload: operation.payload,
    })
    : operation.type === "transaction_workflow"
    ? await supabase.rpc("submit_transaction_workflow", operation.payload)
    : await supabase.rpc("sync_offline_operation", {
      p_operation_id: operation.operationId,
      p_operation_type: operation.type,
      p_payload: operation.payload,
    });

  if (error) {
    console.error("Offline operation rejected:", error.message);
    return Response.json(
      { error: error.message },
      { status: 422, headers: corsHeaders },
    );
  }

  return Response.json(data, { status: 200, headers: corsHeaders });
});
