
import { useEffect, useState } from "react";
import { getQueueSummary } from "./syncQueue";

const QUEUE_UPDATED_EVENT = "amcoms-offline-queue-updated";
const emptySummary = {
  counts: { pending: 0, syncing: 0, synced: 0, failed: 0 },
  pendingCount: 0,
  failed: [],
  latestSyncResult: null,
};

export default function usePendingCount(userId) {
  const [summary, setSummary] = useState(emptySummary);

  useEffect(() => {
    let active = true;

    const updateSummary = async () => {
      try {
        const currentSummary = userId
          ? await getQueueSummary(userId)
          : emptySummary;
        if (active) setSummary(currentSummary);
      } catch (error) {
        console.error("Unable to read the offline sync queue:", error);
      }
    };

    updateSummary();
    window.addEventListener(QUEUE_UPDATED_EVENT, updateSummary);

    return () => {
      active = false;
      window.removeEventListener(QUEUE_UPDATED_EVENT, updateSummary);
    };
  }, [userId]);

  return summary;
}
