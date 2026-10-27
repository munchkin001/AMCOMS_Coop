import { supabase } from "../supabase";
import offlineDb from "./OfflineDb";
import { notifyQueueUpdated, pruneSyncedHistory } from "./syncQueue";

let activeSync = null;

async function refreshSalesOptions(userId) {
  const [productResult, memberResult, accountResult, saleResult] = await Promise.all([
    supabase.from("products")
      .select("id, product_name, product_code, unit_of_measure")
      .eq("is_active", true)
      .order("product_name"),
    supabase.from("members")
      .select("id, member_number, first_name, middle_name, last_name")
      .eq("membership_status", "active")
      .is("archived_at", null)
      .order("last_name"),
    supabase.from("chart_of_accounts")
      .select("account_name")
      .eq("account_type", "revenue")
      .eq("is_active", true)
      .order("account_name"),
    supabase.from("sales_orders")
      .select("id, order_number, customer_name, net_amount, amount_paid, payment_status, order_status, cash_receipt_id, sales_order_items(id, product_id, item_description, quantity, product:products(product_name))")
      .in("payment_status", ["pending", "partial"])
      .order("order_date", { ascending: true }),
  ]);
  const failure = productResult.error || memberResult.error || accountResult.error || saleResult.error;
  if (failure) throw failure;

  await offlineDb.cachedData.put({
    key: `sales-options:${userId}`,
    data: {
      products: productResult.data || [],
      members: memberResult.data || [],
      revenueAccounts: accountResult.data || [],
      outstandingSales: (saleResult.data || []).filter(
        (sale) => Number(sale.net_amount) > Number(sale.amount_paid || 0)
      ),
    },
    updatedAt: new Date().toISOString(),
  });
}

async function refreshLoanApplications(userId) {
  const [termsResult, applicationsResult] = await Promise.all([
    supabase.from("loan_term_options")
      .select("id, term_months, payment_frequency, annual_rate, penalty_rate")
      .eq("is_active", true)
      .order("term_months")
      .order("payment_frequency"),
    supabase.from("requests")
      .select("id, request_number, status, amount, request_data, created_at, review_notes, approval_notes")
      .eq("request_type", "loan_application")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const failure = termsResult.error || applicationsResult.error;
  if (failure) throw failure;

  await offlineDb.cachedData.put({
    key: `loan-applications:${userId}`,
    data: {
      terms: termsResult.data || [],
      applications: applicationsResult.data || [],
    },
    updatedAt: new Date().toISOString(),
  });
}

async function refreshFinancialMemberRecords(userId) {
  const cachePrefix = `financial-member-records:${userId}:`;
  const cachedRecords = await offlineDb.cachedData
    .where("key")
    .startsWith(cachePrefix)
    .toArray();

  for (const cachedRecord of cachedRecords) {
    const memberId = cachedRecord.key.slice(cachePrefix.length);
    if (!memberId) continue;

    const [accountResult, loanResult, contributionResult] = await Promise.all([
      supabase.from("savings_accounts")
        .select("id, account_number, account_type, balance, maturity_date, interest_rate")
        .eq("member_id", memberId)
        .eq("status", "active")
        .order("created_at"),
      supabase.from("loans")
        .select("id, loan_number, balance, principal_amount, interest_rate, term_months, monthly_payment, total_interest, payment_frequency, installments, installment_amount, release_date, created_at")
        .eq("member_id", memberId)
        .eq("status", "active")
        .gt("balance", 0)
        .order("release_date", { ascending: true, nullsFirst: false })
        .order("created_at"),
      supabase.from("member_capital_contributions")
        .select("due_month")
        .eq("member_id", memberId)
        .eq("status", "recorded"),
    ]);
    const failure = accountResult.error || loanResult.error || contributionResult.error;
    if (failure) throw failure;

    const loanIds = (loanResult.data || []).map((loan) => loan.id);
    let scheduleRows = [];
    if (loanIds.length > 0) {
      const { data, error } = await supabase.from("loan_schedule")
        .select("id, loan_id, installment_number, due_date, amount_due, amount_paid, penalty_amount, status")
        .in("loan_id", loanIds)
        .neq("status", "paid")
        .order("installment_number");
      if (error) throw error;
      scheduleRows = data || [];
    }

    const scheduleByLoanId = new Map();
    scheduleRows.forEach((schedule) => {
      const loanSchedule = scheduleByLoanId.get(schedule.loan_id) || [];
      loanSchedule.push(schedule);
      scheduleByLoanId.set(schedule.loan_id, loanSchedule);
    });
    await offlineDb.cachedData.put({
      key: cachedRecord.key,
      data: {
        accounts: accountResult.data || [],
        loans: (loanResult.data || []).map((loan) => ({
          ...loan,
          schedule: scheduleByLoanId.get(loan.id) || [],
        })),
        contributions: contributionResult.data || [],
      },
      updatedAt: new Date().toISOString(),
    });
  }
}

export function syncPendingOperations() {
  if (activeSync) return activeSync;

  activeSync = runSync().finally(() => {
    activeSync = null;
  });

  return activeSync;
}

async function runSync() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0, skipped: true };
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.id) {
    return { syncedCount: 0, failedCount: 0, skipped: true };
  }

  const operations = await offlineDb.syncQueue
    .where("userId")
    .equals(session.user.id)
    .toArray();

  const candidates = operations
    .filter((operation) =>
      operation.status === "pending" ||
      operation.status === "syncing" ||
      (operation.status === "failed" && operation.retryable !== false)
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  let syncedCount = 0;
  let failedCount = 0;
  let memberFinanceSynced = false;
  let inventoryMovementSynced = false;
  let productionSynced = false;
  let salesSynced = false;
  let loanApplicationSynced = false;
  const refreshErrors = [];
  const statusById = new Map(operations.map((operation) => [operation.operationId, operation.status]));

  for (const operation of candidates) {
    if ((operation.dependsOn || []).some((dependency) => statusById.get(dependency) !== "synced")) {
      continue;
    }
    await offlineDb.syncQueue.update(operation.id, {
      status: "syncing",
      attempts: (operation.attempts || 0) + 1,
      lastError: null,
      lastAttemptAt: new Date().toISOString(),
    });
    notifyQueueUpdated();

    try {
      const { data, error } = await supabase.functions.invoke("offline-sync", {
        body: {
          operationId: operation.operationId,
          type: operation.type,
          payload: operation.payload,
        },
      });

      if (error) throw error;
      if (
        data?.accepted !== true ||
        data?.stored !== true ||
        data?.operationId !== operation.operationId
      ) {
        throw new Error("The sync service returned an unexpected response.");
      }

      const syncedAt = new Date().toISOString();
      await offlineDb.syncQueue.update(operation.id, {
        status: "synced",
        payload: null,
        syncedAt: data.serverConfirmedAt || syncedAt,
        confirmationReceivedAt: syncedAt,
        serverResponse: {
          replayed: data.replayed === true,
          result: data.result || null,
        },
        lastError: null,
        retryable: false,
      });
      statusById.set(operation.operationId, "synced");
      memberFinanceSynced ||= [
        "member_financial_entry",
        "member_dividend",
        "cash_receipt",
        "cash_disbursement",
        "cash_receipt_delete",
        "cash_disbursement_delete",
      ].includes(operation.type);
      inventoryMovementSynced ||= operation.type === "inventory_movement";
      productionSynced ||= operation.type === "production_record";
      salesSynced ||= operation.type === "cooperative_sale";
      loanApplicationSynced ||= operation.type === "loan_application";
      syncedCount += 1;
    } catch (syncError) {
      let message = syncError instanceof Error
        ? syncError.message
        : "The operation could not be synchronized.";
      let responseStatus = syncError?.status || syncError?.context?.status || null;
      if (syncError?.context && typeof syncError.context.clone === "function") {
        try {
          const responseBody = await syncError.context.clone().json();
          if (typeof responseBody?.error === "string") message = responseBody.error;
        } catch (responseError) {
          console.error("Unable to read the offline sync error response:", responseError);
        }
      }
      const retryable = responseStatus == null
        || responseStatus === 408
        || responseStatus === 429
        || responseStatus === 401
        || responseStatus >= 500;
      await offlineDb.syncQueue.update(operation.id, {
        status: "failed",
        lastError: message,
        retryable,
      });
      statusById.set(operation.operationId, "failed");
      failedCount += 1;
      console.error(`Offline operation ${operation.operationId} failed to sync:`, syncError);
    }

    notifyQueueUpdated();
  }

  if (syncedCount > 0) {
    try {
      await pruneSyncedHistory(session.user.id);
    } catch (error) {
      console.error("Synced operations were retained, but old activity history could not be pruned:", error);
      refreshErrors.push("Old synced activity could not be pruned on this device.");
    }
  }
  if (memberFinanceSynced) {
    try {
      await refreshFinancialMemberRecords(session.user.id);
    } catch (error) {
      console.error("A financial transaction synced, but saved financial details could not be refreshed:", error);
      refreshErrors.push("Saved member balances could not be refreshed; reopen the form online to reload them.");
    }
  }
  if (inventoryMovementSynced || productionSynced) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, unit_of_measure, stock_inventory(quantity_on_hand)")
      .eq("is_active", true)
      .order("product_name");
    if (error) {
      console.error("Inventory movement synced, but the product cache could not be refreshed:", error);
      refreshErrors.push("Inventory synced, but its cached product list could not be refreshed.");
    } else {
      try {
        await offlineDb.cachedData.put({
          key: `inventory-products:${session.user.id}`,
          data: data || [],
          updatedAt: new Date().toISOString(),
        });
      } catch (cacheError) {
        console.error("Inventory movement synced, but the product cache could not be saved:", cacheError);
        refreshErrors.push("Inventory synced, but its cached product list could not be refreshed.");
      }
    }
  }
  if (salesSynced) {
    try {
      await refreshSalesOptions(session.user.id);
    } catch (error) {
      console.error("Sales synced, but the saved sales options could not be refreshed:", error);
      refreshErrors.push("Sales synced, but saved sale balances could not be refreshed.");
    }
  }
  if (loanApplicationSynced) {
    try {
      await refreshLoanApplications(session.user.id);
    } catch (error) {
      console.error("Loan application synced, but cached applications could not be refreshed:", error);
      refreshErrors.push("Loan applications synced, but the saved application list could not be refreshed.");
    }
  }

  if (syncedCount > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("amcoms-offline-sync-complete"));
  }

  return { syncedCount, failedCount, refreshErrors, skipped: false };
}
