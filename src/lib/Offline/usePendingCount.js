
import { useEffect, useState } from "react";
import { getQueueSummary } from "./syncQueue";

const QUEUE_UPDATED_EVENT = "amcoms-offline-queue-updated";

export default function usePendingCount(userId) {
  const [summary, setSummary] = useState({ pendingCount: 0, failed: [] });

  useEffect(() => {
    let active = true;

    const updateSummary = async () => {
      try {
        const currentSummary = userId
          ? await getQueueSummary(userId)
          : { pendingCount: 0, failed: [] };
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
