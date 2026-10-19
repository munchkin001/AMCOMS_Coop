
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

offlineDb.version(3).stores({
  cachedData: "&key, updatedAt",
  syncQueue: "++id, &operationId, status, createdAt, userId, module, [userId+status], [userId+module]",
}).upgrade((transaction) => transaction.table("syncQueue").toCollection().modify((operation) => {
  const metadata = {
    inventory_movement: ["inventory", "stock movement"],
    production_record: ["production", "production record"],
    member_contact_update: ["profile", "profile update"],
    member_financial_entry: ["member-finance", "financial entry"],
    member_dividend: ["member-finance", "dividend distribution"],
    cash_receipt: ["accounting", "cash receipt"],
    cash_disbursement: ["accounting", "cash disbursement"],
    cash_receipt_delete: ["accounting", "cash receipt deletion"],
    cash_disbursement_delete: ["accounting", "cash disbursement deletion"],
    cooperative_sale: ["sales", "sale or collection"],
    loan_application: ["loans", "loan application"],
    journal_entry: ["accounting", "journal entry"],
    journal_reversal: ["accounting", "journal reversal"],
  }[operation.type] || ["other", "operation"];
  operation.module ||= metadata[0];
  operation.operation ||= metadata[1];
  operation.summary ||= `${metadata[1]} queued`;
  operation.entityId ||= operation.payload?.productId || operation.payload?.member_id || null;
  operation.details ||= {};
  operation.dependsOn ||= [];
  if (operation.retryable == null) operation.retryable = true;
  if (operation.attempts == null) operation.attempts = 0;
}));

export default offlineDb;
