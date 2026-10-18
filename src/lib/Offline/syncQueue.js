
import offlineDb from "./OfflineDb";
import { supabase } from "../supabase";

const ALLOWED_TYPES = new Set(["inventory_movement", "member_contact_update"]);
const QUEUE_UPDATED_EVENT = "amcoms-offline-queue-updated";

export async function queueOperation({ type, payload, userId }) {
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("This operation is not enabled for offline sync.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("A valid operation payload is required.");
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (session?.user?.id && userId && session.user.id !== userId) {
    throw new Error("The signed-in account does not match the account saving this operation.");
  }
  const operationUserId = session?.user?.id || userId;
  if (!operationUserId) throw new Error("Sign in before saving an operation for offline sync.");

  const operationId = crypto.randomUUID();

  await offlineDb.syncQueue.add({
    operationId,
    userId: operationUserId,
    type,
    payload,
    status: "pending",
    createdAt: new Date().toISOString(),
    attempts: 0,
  });

  notifyQueueUpdated();
  return operationId;
}

export async function getOperation(operationId) {
  return offlineDb.syncQueue.where("operationId").equals(operationId).first();
}

export async function getQueueSummary(userId) {
  const operations = await offlineDb.syncQueue.toArray();
  const accountOperations = operations.filter((operation) => operation.userId === userId);
  const pending = accountOperations.filter((operation) =>
    ["pending", "syncing"].includes(operation.status)
  );
  const failed = accountOperations
    .filter((operation) => operation.status === "failed")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(({ operationId, type, lastError, createdAt }) => ({
      operationId,
      type,
      lastError,
      createdAt,
    }));

  return { pendingCount: pending.length, failed };
}

export function notifyQueueUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(QUEUE_UPDATED_EVENT));
  }
}
