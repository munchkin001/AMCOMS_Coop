
import offlineDb from "./OfflineDb";
import { supabase } from "../supabase";
import { emitActionNotification } from "../actionNotifications";

const OPERATION_METADATA = {
  inventory_movement: { module: "inventory", operation: "stock movement" },
  production_record: { module: "production", operation: "production record" },
  member_contact_update: { module: "profile", operation: "profile update" },
  member_financial_entry: { module: "member-finance", operation: "financial entry" },
  member_dividend: { module: "member-finance", operation: "dividend distribution" },
  cash_receipt: { module: "accounting", operation: "cash receipt" },
  cash_disbursement: { module: "accounting", operation: "cash disbursement" },
  cash_receipt_delete: { module: "accounting", operation: "cash receipt deletion" },
  cash_disbursement_delete: { module: "accounting", operation: "cash disbursement deletion" },
  cooperative_sale: { module: "sales", operation: "sale or collection" },
  loan_application: { module: "loans", operation: "loan application" },
  journal_entry: { module: "accounting", operation: "journal entry" },
  journal_reversal: { module: "accounting", operation: "journal reversal" },
};
const QUEUE_UPDATED_EVENT = "amcoms-offline-queue-updated";

export async function queueOperation({
  type,
  payload,
  userId,
  actorRole = null,
  actorName = null,
  allowLocalQueue = false,
  entityId = null,
  summary = null,
  details = null,
  dependsOn = [],
  operationId: requestedOperationId = null,
}) {
  const metadata = OPERATION_METADATA[type];
  if (!metadata) {
    throw new Error("This operation is not enabled for offline sync.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A valid operation payload is required.");
  }

  let session = null;
  if (navigator.onLine) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data.session;
  }
  if (session?.user?.id && userId && session.user.id !== userId) {
    throw new Error("The signed-in account does not match the account saving this operation.");
  }
  if (!session && navigator.onLine && !allowLocalQueue) {
    throw new Error("An online sign-in is required to queue changes while connected.");
  }
  const operationUserId = session?.user?.id || userId;
  if (!operationUserId) throw new Error("Sign in before saving an operation for offline sync.");
  if (!Array.isArray(dependsOn) || dependsOn.some((id) => typeof id !== "string")) {
    throw new Error("Operation dependencies must be valid operation IDs.");
  }

  const operationId = requestedOperationId || crypto.randomUUID();
  if (
    typeof operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  ) {
    throw new Error("A valid persistent operation ID is required.");
  }
  const createdAt = new Date().toISOString();

  await offlineDb.syncQueue.add({
    operationId,
    userId: operationUserId,
    type,
    module: metadata.module,
    operation: metadata.operation,
    entityId,
    actorRole,
    actorName,
    summary: summary || `${metadata.operation} queued`,
    details: details && typeof details === "object" && !Array.isArray(details) ? details : {},
    dependsOn,
    payload,
    status: "pending",
    createdAt,
    attempts: 0,
    lastError: null,
    retryable: true,
    syncedAt: null,
    serverResponse: null,
  });

  notifyQueueUpdated();
  emitActionNotification("Change saved and queued for sync.");
  return operationId;
}

export async function getOperation(operationId) {
  return offlineDb.syncQueue.where("operationId").equals(operationId).first();
}

export async function getQueueSummary(userId) {
  if (!userId) {
    return {
      counts: { pending: 0, syncing: 0, synced: 0, failed: 0 },
      pendingCount: 0,
      failed: [],
      latestSyncResult: null,
    };
  }
  const accountOperations = await offlineDb.syncQueue
    .where("userId")
    .equals(userId)
    .toArray();
  const counts = Object.fromEntries(
    ["pending", "syncing", "synced", "failed"].map((status) => [
      status,
      accountOperations.filter((operation) => operation.status === status).length,
    ])
  );
  const failed = accountOperations
    .filter((operation) => operation.status === "failed")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(({ operationId, type, module, summary, lastError, retryable, createdAt }) => ({
      operationId,
      type,
      module,
      summary,
      lastError,
      retryable,
      createdAt,
    }));

  const latestSyncResult = accountOperations
    .filter((operation) => operation.status === "synced" && operation.syncedAt)
    .sort((left, right) => right.syncedAt.localeCompare(left.syncedAt))[0] || null;
  return {
    counts,
    pendingCount: counts.pending + counts.syncing,
    failed,
    latestSyncResult: latestSyncResult
      ? { summary: latestSyncResult.summary, syncedAt: latestSyncResult.syncedAt }
      : null,
  };
}

export async function getActivityHistory({ userId, status = "all", module = "all", limit = 100 }) {
  if (!userId) return [];
  const operations = await offlineDb.syncQueue.where("userId").equals(userId).toArray();
  return operations
    .filter((operation) =>
      (status === "all" || operation.status === status) &&
      (module === "all" || operation.module === module)
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function retryOperation(operationId, userId) {
  const operation = await getOperation(operationId);
  if (!operation || operation.userId !== userId) {
    throw new Error("This offline activity is not available for the signed-in account.");
  }
  if (operation.status !== "failed" || operation.retryable === false) {
    throw new Error("This operation cannot be retried from the activity history.");
  }
  await offlineDb.syncQueue.update(operation.id, {
    status: "pending",
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
  notifyQueueUpdated();
}

export async function pruneSyncedHistory(userId, retentionDays = 90) {
  if (!userId) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = await offlineDb.syncQueue
    .where("userId")
    .equals(userId)
    .filter((operation) =>
      operation.status === "synced" &&
      operation.syncedAt &&
      new Date(operation.syncedAt).getTime() < cutoff
    )
    .toArray();
  if (expired.length > 0) {
    await offlineDb.syncQueue.bulkDelete(expired.map((operation) => operation.id));
  }
  return expired.length;
}

export function notifyQueueUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_UPDATED_EVENT));
  }
}
