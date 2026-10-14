import { supabase } from "../supabase";
import offlineDb from "./OfflineDb";
import { notifyQueueUpdated } from "./syncQueue";

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

  const candidates = operations.filter((operation) =>
    ["pending", "failed", "syncing"].includes(operation.status)
  );

  let syncedCount = 0;
  let failedCount = 0;

  for (const operation of candidates) {
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

      await offlineDb.syncQueue.update(operation.id, {
        status: "synced",
        payload: null,
        syncedAt: new Date().toISOString(),
        syncResult: data,
        lastError: null,
      });
      syncedCount += 1;
    } catch (syncError) {
      let message = syncError instanceof Error
        ? syncError.message
        : "The operation could not be synchronized.";
      if (syncError?.context && typeof syncError.context.clone === "function") {
        try {
          const responseBody = await syncError.context.clone().json();
          if (typeof responseBody?.error === "string") message = responseBody.error;
        } catch (responseError) {
          console.error("Unable to read the offline sync error response:", responseError);
        }
      }
      await offlineDb.syncQueue.update(operation.id, {
        status: "failed",
        lastError: message,
      });
      failedCount += 1;
      console.error(`Offline operation ${operation.operationId} failed to sync:`, syncError);
    }

    notifyQueueUpdated();
  }

  return { syncedCount, failedCount, skipped: false };
}
