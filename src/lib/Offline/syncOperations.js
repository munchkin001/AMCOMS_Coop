import { supabase } from "../supabase";
import offlineDb from "./OfflineDb";
import { notifyQueueUpdated, pruneSyncedHistory } from "./syncQueue";

let activeSync = null;

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
      await offlineDb.cachedData
        .where("key")
        .startsWith(`financial-member-records:${session.user.id}:`)
        .delete();
    } catch (error) {
      console.error("A financial transaction synced, but saved financial details could not be invalidated:", error);
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
      await offlineDb.cachedData.delete(`sales-options:${session.user.id}`);
    } catch (error) {
      console.error("Sales synced, but the saved sales options could not be invalidated:", error);
      refreshErrors.push("Sales synced, but saved sale balances could not be refreshed.");
    }
  }
  if (loanApplicationSynced) {
    try {
      await offlineDb.cachedData.delete(`loan-applications:${session.user.id}`);
    } catch (error) {
      console.error("Loan application synced, but cached applications could not be invalidated:", error);
      refreshErrors.push("Loan applications synced, but the saved application list could not be refreshed.");
    }
  }

  return { syncedCount, failedCount, refreshErrors, skipped: false };
}
