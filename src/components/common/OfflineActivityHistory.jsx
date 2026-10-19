import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getActivityHistory, retryOperation } from "../../lib/Offline/syncQueue";
import { syncPendingOperations } from "../../lib/Offline/syncOperations";

const moduleLabels = {
  inventory: "Inventory",
  production: "Production",
  profile: "Profile",
  "member-finance": "Member financial entries",
  accounting: "Accounting",
  sales: "Sales",
  loans: "Loans",
};

const statusLabels = {
  pending: "Pending",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Failed",
};

const formatTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
};

export default function OfflineActivityHistory({ open, online, offlineMode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [status, setStatus] = useState("all");
  const [module, setModule] = useState("all");
  const [activities, setActivities] = useState([]);
  const [retryingId, setRetryingId] = useState(null);
  const [retryError, setRetryError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setActivities(await getActivityHistory({ userId, status, module }));
    } catch (error) {
      console.error("Unable to load offline activity history:", error);
      setRetryError(error instanceof Error ? error.message : "Offline activity could not be loaded.");
    }
  }, [module, status, userId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("amcoms-offline-queue-updated", refresh);
    return () => window.removeEventListener("amcoms-offline-queue-updated", refresh);
  }, [open, refresh]);

  const handleRetry = async (operationId) => {
    setRetryingId(operationId);
    setRetryError("");
    try {
      await retryOperation(operationId, user?.id);
      await syncPendingOperations();
      await refresh();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "The operation could not be retried.");
    } finally {
      setRetryingId(null);
    }
  };

  if (!open) return null;

  return (
    <section aria-label="Offline activity history" className="border-t border-gray-200 bg-white px-3 py-3 text-sm text-gray-800">
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="flex items-center gap-2">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded border border-gray-300 px-2 py-1">
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Module
          <select value={module} onChange={(event) => setModule(event.target.value)} className="rounded border border-gray-300 px-2 py-1">
            <option value="all">All modules</option>
            {Object.entries(moduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        Recorded time is this device’s clock and may differ from server time. “Synced” means the server confirmed the operation.
      </p>
      {retryError && <p role="alert" className="mb-3 text-red-800">{retryError}</p>}
      {activities.length === 0 ? (
        <p>No offline activity matches these filters.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map((activity) => (
            <li key={activity.operationId} className="rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{activity.summary}</p>
                  <p>{moduleLabels[activity.module] || activity.module} · {activity.entityId ? `Record ${activity.entityId}` : activity.operation}</p>
                  <p className="text-gray-600">
                    {activity.actorName || "Signed-in user"}{activity.actorRole ? ` (${activity.actorRole})` : ""} · recorded {formatTime(activity.createdAt)} (device time)
                  </p>
                  {activity.status === "synced" && (
                    <p className="text-green-800">Server confirmed {formatTime(activity.syncedAt)}</p>
                  )}
                  {activity.status === "failed" && (
                    <p className="mt-1 text-red-800">
                      Not synced after {activity.attempts || 0} attempt{activity.attempts === 1 ? "" : "s"}: {activity.lastError || "The server did not accept this operation."}
                    </p>
                  )}
                </div>
                <span className={`rounded px-2 py-1 text-xs font-semibold ${
                  activity.status === "failed" ? "bg-red-100 text-red-800"
                    : activity.status === "synced" ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-900"
                }`}>
                  {statusLabels[activity.status] || activity.status}
                </span>
              </div>
              {activity.details && Object.keys(activity.details).length > 0 && (
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {Object.entries(activity.details).filter(([, value]) => value != null).map(([key, value]) => (
                    <div key={key}><dt className="inline capitalize">{key.replaceAll(/([A-Z])/g, " $1")}: </dt><dd className="inline">{String(value)}</dd></div>
                  ))}
                </dl>
              )}
              {activity.status === "failed" && activity.retryable !== false && (
                <button
                  type="button"
                  disabled={!online || offlineMode || retryingId === activity.operationId}
                  onClick={() => handleRetry(activity.operationId)}
                  className="mt-2 rounded border border-blue-700 px-3 py-1 text-xs font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {retryingId === activity.operationId ? "Retrying..." : "Retry"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
