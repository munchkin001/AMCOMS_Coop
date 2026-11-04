import { supabase } from "./supabase";

const CASH_ACCOUNTS = ["Cash on Hand", "Cash in Bank"];
const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row) || 0), 0);

export const localDate = (date = new Date()) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
};

export const shiftDate = (iso, days) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
};

export const sameReconciliationValue = (left, right) => Math.abs(left - right) < 0.01;

export const emptyReconciliationDay = () => ({
  receipts: 0,
  receiptCount: 0,
  disbursements: 0,
  disbursementCount: 0,
  ledgerDebits: 0,
  ledgerCredits: 0,
  journalCount: 0,
  loanReceipts: 0,
  loanPayments: 0,
  loansDisbursed: 0,
  loansReleased: 0,
  unbalanced: 0,
  receiptRecords: [],
  disbursementRecords: [],
  journalEntries: [],
  cashJournalEntries: [],
  loanPaymentRecords: [],
  loanReceiptRecords: [],
  loanDisbursementRecords: [],
  loanReleaseRecords: [],
});

export const reconciliationRows = (day) => [
  { label: "Cash received", books: day.receipts, ledger: day.ledgerDebits, details: true },
  { label: "Cash disbursed", books: day.disbursements, ledger: day.ledgerCredits, details: true },
  {
    label: "Loan principal applied",
    detail: "Excludes interest and penalties",
    books: day.loanReceipts,
    ledger: day.loanPayments,
    details: true,
  },
  { label: "Loans released", books: day.loansDisbursed, ledger: day.loansReleased, details: true },
  {
    label: "Entries recorded",
    books: day.receiptCount + day.disbursementCount,
    ledger: day.journalCount,
    count: true,
    details: true,
  },
];

export async function loadReconciliationDays(selectedDate, dayCount = 7) {
  const from = shiftDate(selectedDate, -(dayCount - 1));
  const [receiptsRes, disbursementsRes, journalRes, paymentsRes, loansRes] = await Promise.all([
    supabase.from("cash_receipts")
      .select("id, receipt_number, receipt_date, received_from, description, amount, status, lines:cash_receipt_lines(amount, side, account:chart_of_accounts(account_name))")
      .gte("receipt_date", from).lte("receipt_date", selectedDate),
    supabase.from("cash_disbursements")
      .select("id, voucher_number, disbursement_date, payee, description, amount, status, lines:cash_disbursement_lines(amount, account:chart_of_accounts(account_name))")
      .gte("disbursement_date", from).lte("disbursement_date", selectedDate),
    supabase.from("journal_entries")
      .select("id, entry_number, entry_date, status, lines:journal_entry_lines(debit_amount, credit_amount, account:chart_of_accounts(account_name))")
      .eq("status", "posted")
      .is("reversed_by_entry_id", null)
      .neq("entry_type", "reversing")
      .gte("entry_date", from).lte("entry_date", selectedDate),
    supabase.from("loan_payments").select("id, loan_id, payment_date, principal_paid, receipt_id")
      .eq("status", "recorded").not("receipt_id", "is", null)
      .gte("payment_date", from).lte("payment_date", selectedDate),
    supabase.from("loans").select("id, loan_number, member_id, release_date, principal_amount, status")
      .gte("release_date", from).lte("release_date", selectedDate).neq("status", "rejected"),
  ]);

  const failed = [receiptsRes, disbursementsRes, journalRes, paymentsRes, loansRes].find((result) => result.error);
  if (failed) throw failed.error;

  const days = {};
  const day = (key) => (days[key] = days[key] || emptyReconciliationDay());
  let draftCount = 0;

  (receiptsRes.data || []).forEach((receipt) => {
    if (receipt.status === "draft") {
      draftCount += 1;
      return;
    }
    if (receipt.status !== "recorded") return;
    const currentDay = day(receipt.receipt_date);
    currentDay.receipts += Number(receipt.amount);
    currentDay.receiptCount += 1;
    currentDay.receiptRecords.push({
      id: receipt.id,
      reference: receipt.receipt_number,
      description: receipt.description || receipt.received_from || "Cash receipt",
      amount: Number(receipt.amount),
      date: receipt.receipt_date,
    });
    const loanPrincipal = sum(
      (receipt.lines || []).filter(
        (line) => line.side === "credit" && line.account?.account_name === "Loan Receivable"
      ),
      (line) => line.amount
    );
    currentDay.loanReceipts += loanPrincipal;
    if (loanPrincipal > 0) {
      currentDay.loanReceiptRecords.push({
        id: receipt.id,
        reference: receipt.receipt_number,
        description: receipt.description || receipt.received_from || "Loan payment receipt",
        amount: loanPrincipal,
        date: receipt.receipt_date,
      });
    }
  });

  (disbursementsRes.data || []).forEach((disbursement) => {
    if (disbursement.status === "draft") {
      draftCount += 1;
      return;
    }
    if (disbursement.status !== "recorded") return;
    const currentDay = day(disbursement.disbursement_date);
    currentDay.disbursements += Number(disbursement.amount);
    currentDay.disbursementCount += 1;
    currentDay.disbursementRecords.push({
      id: disbursement.id,
      reference: disbursement.voucher_number,
      description: disbursement.description || disbursement.payee || "Cash disbursement",
      amount: Number(disbursement.amount),
      date: disbursement.disbursement_date,
    });
    const loanPrincipal = sum(
      (disbursement.lines || []).filter((line) =>
        ["Loan Payable", "Loan Receivable"].includes(line.account?.account_name)
      ),
      (line) => line.amount
    );
    currentDay.loansDisbursed += loanPrincipal;
    if (loanPrincipal > 0) {
      currentDay.loanDisbursementRecords.push({
        id: disbursement.id,
        reference: disbursement.voucher_number,
        description: disbursement.description || disbursement.payee || "Loan disbursement",
        amount: loanPrincipal,
        date: disbursement.disbursement_date,
      });
    }
  });

  (journalRes.data || []).forEach((entry) => {
    const currentDay = day(entry.entry_date);
    const lines = entry.lines || [];
    const isCashBookEntry = entry.entry_number?.startsWith("CR-") || entry.entry_number?.startsWith("CD-");
    const cashLines = lines.filter((line) => CASH_ACCOUNTS.includes(line.account?.account_name));
    const journalRecord = {
      id: entry.id,
      reference: entry.entry_number,
      description: entry.description || "Journal entry",
      date: entry.entry_date,
      cashDebit: sum(cashLines, (line) => line.debit_amount),
      cashCredit: sum(cashLines, (line) => line.credit_amount),
      debitTotal: sum(lines, (line) => line.debit_amount),
      creditTotal: sum(lines, (line) => line.credit_amount),
      isCashBookEntry,
      lines: lines.map((line) => ({
        account: line.account?.account_name || "Unknown account",
        debit: Number(line.debit_amount || 0),
        credit: Number(line.credit_amount || 0),
      })),
    };
    currentDay.journalEntries.push(journalRecord);
    if (isCashBookEntry) {
      currentDay.journalCount += 1;
      currentDay.cashJournalEntries.push(journalRecord);
    }
    cashLines.forEach((line) => {
      currentDay.ledgerDebits += Number(line.debit_amount);
      currentDay.ledgerCredits += Number(line.credit_amount);
    });
    if (!sameReconciliationValue(
      sum(lines, (line) => line.debit_amount),
      sum(lines, (line) => line.credit_amount)
    )) {
      currentDay.unbalanced += 1;
    }
  });

  (paymentsRes.data || []).forEach((payment) => {
    const currentDay = day(payment.payment_date);
    currentDay.loanPayments += Number(payment.principal_paid);
    currentDay.loanPaymentRecords.push({
      id: payment.id,
      reference: payment.receipt_id || payment.id,
      description: "Recorded principal payment",
      amount: Number(payment.principal_paid),
      date: payment.payment_date,
    });
  });
  (loansRes.data || []).forEach((loan) => {
    const currentDay = day(loan.release_date);
    currentDay.loansReleased += Number(loan.principal_amount);
    currentDay.loanReleaseRecords.push({
      id: loan.id,
      reference: loan.loan_number,
      description: "Loan principal released",
      amount: Number(loan.principal_amount),
      date: loan.release_date,
    });
  });

  return { days, draftCount };
}
