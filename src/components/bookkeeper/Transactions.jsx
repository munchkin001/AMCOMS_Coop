import React, { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { queueOperation } from '../../lib/Offline/syncQueue';
import TransactionList from './transactions/TransactionList';
import TransactionTypeSelector from './transactions/TransactionTypeSelector';
import CashReceiptForm from './transactions/CashReceiptForm';
import CashDisbursementForm from './transactions/CashDisbursementForm';
import MemberFinancialEntryForm from './transactions/MemberFinancialEntryForm';
import SalesForm from './transactions/SalesForm';
import TransactionDetail from './transactions/TransactionDetail';

const Transactions = ({ initialType = null, startNewTransaction = false }) => {
  const location = useLocation();
  const { user, staff, offlineMode } = useAuth();
  const requestedType = initialType || location.state?.initialTransactionType || null;
  const shouldStartNew = startNewTransaction || location.state?.startNewTransaction;
  const [view, setView] = useState(requestedType ? 'form' : shouldStartNew ? 'type-selector' : 'list'); // 'list', 'type-selector', 'form', 'detail'
  const [selectedType, setSelectedType] = useState(requestedType);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const operationId = useRef(crypto.randomUUID());

  const handleNewTransaction = () => {
    operationId.current = crypto.randomUUID();
    setView('type-selector');
  };

  const handleSelectType = (type) => {
    operationId.current = crypto.randomUUID();
    setSelectedType(type);
    setView('form');
  };

  const handleCancel = () => {
    operationId.current = crypto.randomUUID();
    setView('list');
    setSelectedType(null);
    setSelectedTransaction(null);
  };

  const queueOfflineOperation = async ({ type, payload, entityId = null, summary, details = {} }) => {
    await queueOperation({
      type,
      payload,
      userId: user?.id,
      actorRole: staff?.role,
      actorName: staff?.full_name,
      allowLocalQueue: true,
      operationId: operationId.current,
      entityId,
      summary,
      details: { ...details, localRecordedAt: new Date().toISOString() },
    });
    setActionNotice("Pending Sync: saved on this device, not yet posted. The server will validate it and issue any official receipt number after reconnecting.");
  };

  const handleSaveTransaction = async (data) => {
    setActionError('');
    setActionNotice('');
    const shouldQueue = !navigator.onLine || offlineMode;
    let issuedReceiptNumber = null;
    const saveIdempotently = async (type, payload) => {
      const { data: response, error } = await supabase.rpc('sync_offline_operation', {
        p_operation_id: operationId.current,
        p_operation_type: type,
        p_payload: payload,
      });
      if (error) throw error;
      if (!response?.accepted || response.operationId !== operationId.current || !('result' in response)) {
        throw new Error('The server did not confirm this transaction. Retry without starting a new transaction.');
      }
      return response.result;
    };

    if (selectedType === 'sales') {
      if (data.action === 'cancel-credit-sale') {
        if (shouldQueue) throw new Error('Reconnect before cancelling a credit sale. Nothing was changed.');
        const { data: result, error } = await supabase.rpc('cancel_credit_sale', {
          p_sales_order_id: data.p_sales_order_id,
          p_reason: data.p_reason,
          p_returned_items: data.p_returned_items,
        });
        if (error) throw error;
        setActionNotice(result?.already_cancelled
          ? 'This credit sale was already cancelled; no additional reversal or inventory return was created.'
          : `Credit sale ${result?.order_number || ''} was cancelled. Only confirmed returned quantities were restored.`);
      } else if (shouldQueue) {
        const sale = data.p_sale;
        await queueOfflineOperation({
          type: 'cooperative_sale',
          payload: data,
          entityId: sale.sales_order_id || sale.product_id || null,
          summary: sale.flow === 'collection' ? 'Credit sale collection queued' : 'Cooperative sale queued',
          details: { amount: sale.amount, reference: sale.reference_number },
        });
      } else {
        const result = await saveIdempotently('cooperative_sale', data);
        issuedReceiptNumber = result?.receipt_number || null;
      }
    } else if (['loan-payment', 'savings-deposit', 'other-transaction'].includes(selectedType)) {
      if (shouldQueue) {
        if (staff?.role !== 'bookkeeper') {
          throw new Error('Only a bookkeeper can queue this operation. Nothing was saved.');
        }
        const entry = data.p_entry;
        const memberId = data.p_receipt?.member_id || data.p_disbursement?.member_id;
        const entryLabels = {
          savings_deposit: 'Savings deposit',
          savings_withdrawal: 'Savings withdrawal',
          time_deposit: 'Time deposit placement',
          time_deposit_withdrawal: 'Time deposit withdrawal',
          loan_payment: 'Loan payment',
          capital_contribution: 'Capital contribution',
        };
        const dividend = Boolean(data.dividend);
        await queueOfflineOperation({
          type: dividend ? 'member_dividend' : 'member_financial_entry',
          payload: dividend ? { p_distribution: data.p_distribution } : data,
          entityId: memberId,
          summary: dividend
            ? 'Approved member dividend distribution queued'
            : `${entryLabels[entry?.entry_type] || 'Member financial entry'} queued`,
          details: {
            entryType: dividend ? 'dividend_distribution' : entry?.entry_type,
            amount: dividend
              ? Number(data.p_distribution?.dividend_amount || 0) + Number(data.p_distribution?.patronage_amount || 0)
              : data.p_receipt?.amount ?? data.p_disbursement?.amount ?? null,
            reference: dividend
              ? data.p_distribution?.reference_number
              : data.p_disbursement?.voucher_number ?? null,
          },
        });
      } else {
        const result = await saveIdempotently(
          data.dividend ? 'member_dividend' : 'member_financial_entry',
          data.dividend ? { p_distribution: data.p_distribution } : data
        );
        issuedReceiptNumber = result?.receipt_number || null;
      }
    } else if (selectedType === 'cash-receipt' || data.type === 'cash-receipt') {
      const payload = {
        p_receipt: {
          receipt_date: data.date,
          received_from: data.member.trim(),
          member_id: data.memberId || null,
          amount: Number(data.amount),
          payment_method: data.paymentMethod,
          description: data.particulars.trim(),
          status: data.status
        },
        p_allocations: data.accountDistribution.map((allocation) => ({
          account: allocation.account,
          amount: Number(allocation.amount),
          side: allocation.side
        }))
      };

      if (shouldQueue) {
        await queueOfflineOperation({
          type: 'cash_receipt',
          payload,
          entityId: data.memberId || null,
          summary: 'Cash receipt queued for server-issued receipt number',
          details: { amount: Number(data.amount) },
        });
      } else {
        const result = await saveIdempotently('cash_receipt', payload);
        issuedReceiptNumber = result?.receipt_number || null;
      }
    } else if (selectedType === 'cash-disbursement' || data.type === 'cash-disbursement') {
      const payload = {
        p_disbursement: {
          disbursement_date: data.date,
          voucher_number: data.voucherNumber.trim(),
          member_id: data.memberId,
          term_months: data.termMonths ? Number(data.termMonths) : null,
          payment_frequency: data.paymentFrequency,
          amount: Number(data.paymentAmount),
          payment_source: data.paymentSource,
          description: data.particulars.trim(),
          status: data.status
        },
        p_allocations: data.accountAllocations.map((allocation) => ({
          account: allocation.account,
          amount: Number(allocation.amount)
        }))
      };

      if (shouldQueue) {
        await queueOfflineOperation({
          type: 'cash_disbursement',
          payload,
          entityId: data.memberId || null,
          summary: `Cash disbursement ${data.voucherNumber.trim()} queued`,
          details: { amount: Number(data.paymentAmount), reference: data.voucherNumber.trim() },
        });
      } else {
        await saveIdempotently('cash_disbursement', payload);
      }
    } else {
      throw new Error('Unsupported transaction type.');
    }

    if (issuedReceiptNumber) {
      setActionNotice(`Official receipt ${issuedReceiptNumber} was issued.`);
    } else if (!shouldQueue && data.type === 'cash-receipt' && data.status === 'draft') {
      setActionNotice('Draft saved. An official receipt number will be issued when the receipt is recorded.');
    }

    setView('list');
    operationId.current = crypto.randomUUID();
    setSelectedType(null);
    setSelectedTransaction(null);
  };

  const handleViewTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setView('detail');
  };

  const handleEditTransaction = (transaction) => {
    operationId.current = crypto.randomUUID();
    setSelectedTransaction(transaction);
    setSelectedType(transaction.type);
    setView('form');
  };

  const handleDeleteTransaction = async (transaction, reason = '') => {
    setActionError('');
    const fn = transaction.type === 'cash-disbursement' ? 'delete_cash_disbursement' : 'delete_cash_receipt';
    const param = transaction.type === 'cash-disbursement' ? 'p_disbursement_id' : 'p_receipt_id';
    if (!navigator.onLine || offlineMode) {
      if (transaction.type === 'cash-receipt') {
        setActionError('Reconnect to void this receipt so the reason and reversal are recorded on the server.');
        return;
      }
      try {
        const disbursement = transaction.type === 'cash-disbursement';
        await queueOfflineOperation({
          type: disbursement ? 'cash_disbursement_delete' : 'cash_receipt_delete',
          payload: { [param]: transaction.id },
          entityId: transaction.id,
          summary: 'Cash disbursement deletion queued',
          details: { reference: transaction.repCvNumber || transaction.receiptNo || transaction.referenceNo || null },
        });
        setView('list');
        setSelectedTransaction(null);
      } catch (error) {
        setActionError(`Unable to queue transaction deletion: ${error.message}`);
      }
      return;
    }
    const { error } = transaction.type === 'cash-receipt'
      ? await supabase.rpc('void_cash_receipt', { p_receipt_id: transaction.id, p_reason: reason })
      : await supabase.rpc(fn, { [param]: transaction.id });
    if (error) {
      setActionError(`${transaction.type === 'cash-receipt' ? 'Unable to void receipt' : 'Unable to delete transaction'}: ${error.message}`);
      return;
    }
    if (transaction.type === 'cash-receipt') {
      setActionNotice(`Receipt ${transaction.repCvNumber} was voided. Its number and history have been retained.`);
    }
    setView('list');
    setSelectedTransaction(null);
  };

  return (
    <div>
      {actionError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}
      {actionNotice && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{actionNotice}</p>}
      {view === 'list' && (
        <TransactionList 
          onNewTransaction={handleNewTransaction}
          onViewTransaction={handleViewTransaction}
        />
      )}

      {view === 'type-selector' && (
        <TransactionTypeSelector 
          onSelectType={handleSelectType}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'cash-receipt' && (
        <CashReceiptForm 
          transaction={selectedTransaction}
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'cash-disbursement' && (
        <CashDisbursementForm 
          transaction={selectedTransaction}
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'sales' && (
        <SalesForm
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'loan-payment' && (
        <MemberFinancialEntryForm
          initialEntryType="loan_payment"
          allowedEntryTypes={['loan_payment']}
          title="Loan Payment"
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'savings-deposit' && (
        <MemberFinancialEntryForm
          initialEntryType="savings_deposit"
          allowedEntryTypes={['savings_deposit', 'savings_withdrawal', 'time_deposit', 'time_deposit_withdrawal']}
          title="Savings / Deposit"
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'form' && selectedType === 'other-transaction' && (
        <MemberFinancialEntryForm
          initialEntryType="capital_contribution"
          allowedEntryTypes={['capital_contribution', 'dividend_distribution']}
          title="Other Transaction"
          onSave={handleSaveTransaction}
          onCancel={handleCancel}
        />
      )}

      {view === 'detail' && selectedTransaction && (
        <TransactionDetail 
          transaction={selectedTransaction}
          onBack={handleCancel}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
        />
      )}
    </div>
  );
};

export default Transactions;
