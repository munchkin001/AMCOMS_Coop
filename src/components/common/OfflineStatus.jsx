
import { useEffect, useState } from "react";

export default function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      role="status"
      className={`px-3 py-2 text-sm ${
        online
          ? "bg-green-100 text-green-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {online
        ? "Online — connection available"
        : "Offline — changes may not sync"}
    </div>
  );
}
