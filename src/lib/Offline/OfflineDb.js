
import Dexie from "dexie";

const offlineDb = new Dexie("AMCOMS_Offline");

offlineDb.version(1).stores({
  cachedData: "&key, updatedAt",
  syncQueue: "++id, &operationId, status, createdAt",
});

offlineDb.version(2).stores({
  cachedData: "&key, updatedAt",
  syncQueue: "++id, &operationId, status, createdAt, userId",
});

export default offlineDb;
