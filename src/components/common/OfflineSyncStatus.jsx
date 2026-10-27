
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { syncPendingOperations } from "../../lib/Offline/syncOperations";
import { supabase } from "../../lib/supabase";
import usePendingCount from "../../lib/Offline/usePendingCount";
import OfflineActivityHistory from "./OfflineActivityHistory";

export default function OfflineSyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncError, setSyncError] = useState("");
  const { user, offlineMode } = useAuth();
  const { pendingCount, failed, counts, latestSyncResult } = usePendingCount(user?.id);
  const [historyOpen, setHistoryOpen] = useState(false);

  const sync = useCallback(async () => {
    try {
      if (offlineMode) return;
      const result = await syncPendingOperations();
      setSyncError(result.failedCount > 0
        ? "Some queued changes could not be synced. Review the error details below."
        : result.refreshErrors?.join(" ") || "");
    } catch (error) {
      console.error("Unable to process offline sync queue:", error);
      setSyncError(error instanceof Error ? error.message : "The offline queue could not be synced.");
    }
  }, [offlineMode]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      sync().catch((error) => console.error("Unable to sync after coming online:", error));
    };
    const handleOffline = () => setOnline(false);
    const handleAuthChange = () => {
      window.setTimeout(() => {
        sync().catch((error) => console.error("Unable to sync after authentication changed:", error));
      }, 0);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const initialSyncTimer = offlineMode ? null : window.setTimeout(() => {
      sync().catch((error) => console.error("Unable to start offline sync:", error));
    }, 0);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      if (initialSyncTimer != null) window.clearTimeout(initialSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      subscription.unsubscribe();
    };
  }, [offlineMode, sync]);

  return (
    <>
      <div
        role="status"
        className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${
          online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
        }`}
      >
        <span>{online ? "Online" : "Offline"}</span>
        <span>
          {pendingCount > 0
            ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync`
            : online
              ? "No pending changes"
              : "No changes waiting to sync"}
        </span>
        <span className="text-xs">
          {counts.pending} pending · {counts.syncing} syncing · {counts.failed} failed
        </span>
        {latestSyncResult && (
          <span className="text-xs">
            Latest server confirmation: {latestSyncResult.summary} ({new Date(latestSyncResult.syncedAt).toLocaleString()})
          </span>
        )}
        {offlineMode && pendingCount > 0 && (
          <span>
            {online
              ? "Saved on this device; sign in online to sync."
              : "Saved on this device; reconnect and sign in online to sync."}
          </span>
        )}
        {!online && pendingCount > 0 && !offlineMode && (
          <span>Saved on this device; sync resumes when online.</span>
        )}
        {failed.length > 0 && (
          <span className="text-red-800">
            {failed.length} need{failed.length === 1 ? "s" : ""} attention
          </span>
        )}
        {online && !offlineMode && (pendingCount > 0 || failed.length > 0) && (
          <button type="button" onClick={sync} className="font-semibold underline">
            Sync now
          </button>
        )}
        <button type="button" onClick={() => setHistoryOpen((open) => !open)} className="font-semibold underline">
          {historyOpen ? "Hide activity history" : "Offline activity history"}
        </button>
      </div>
      <OfflineActivityHistory open={historyOpen} online={online} offlineMode={offlineMode} />
      {offlineMode && (
        <p role="status" className="bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Unlocked with this device’s PIN. You are viewing cached data; locally queued changes require online sign-in before the server can apply them.
        </p>
      )}
      {syncError && (
        <p role="alert" className="bg-red-50 px-3 py-2 text-sm text-red-800">
          {syncError}
        </p>
      )}
      {failed.slice(0, 3).map((operation) => (
        <p key={operation.operationId} role="alert" className="bg-red-50 px-3 py-1 text-xs text-red-800">
          A queued {operation.type.replaceAll("_", " ")} could not sync: {operation.lastError}
        </p>
      ))}
    </>
  );
}
