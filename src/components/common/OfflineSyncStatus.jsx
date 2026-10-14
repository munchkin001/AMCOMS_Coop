
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { syncPendingOperations } from "../../lib/Offline/syncOperations";
import { supabase } from "../../lib/supabase";
import usePendingCount from "../../lib/Offline/usePendingCount";

export default function OfflineSyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncError, setSyncError] = useState("");
  const { user } = useAuth();
  const { pendingCount, failed } = usePendingCount(user?.id);

  const sync = useCallback(async () => {
    try {
      const result = await syncPendingOperations();
      setSyncError(result.failedCount > 0
        ? "Some queued changes could not be synced. Review the error details below."
        : "");
    } catch (error) {
      console.error("Unable to process offline sync queue:", error);
      setSyncError(error instanceof Error ? error.message : "The offline queue could not be synced.");
    }
  }, []);

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
    const initialSyncTimer = window.setTimeout(() => {
      sync().catch((error) => console.error("Unable to start offline sync:", error));
    }, 0);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => {
      window.clearTimeout(initialSyncTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      subscription.unsubscribe();
    };
  }, [sync]);

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
          {pendingCount} pending change{pendingCount === 1 ? "" : "s"}
        </span>
        {failed.length > 0 && (
          <span className="text-red-800">
            {failed.length} need{failed.length === 1 ? "s" : ""} attention
          </span>
        )}
        {online && (pendingCount > 0 || failed.length > 0) && (
          <button type="button" onClick={sync} className="font-semibold underline">
            Sync now
          </button>
        )}
      </div>
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
