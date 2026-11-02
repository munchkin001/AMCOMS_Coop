import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { queueOperation } from '../../lib/Offline/syncQueue';
import TransactionList from './transactions/TransactionList';
import TransactionTypeSelector from './transactions/TransactionTypeSelector';
import CashReceiptForm from './transactions/CashReceiptForm';
import CashDisbursementForm from './transactions/CashDisbursementForm';
import MemberFinancialEntryForm from './transactions/MemberFinancialEntryForm';
import SalesForm from './transactions/SalesForm';
import BankTransferForm from './transactions/BankTransferForm';
import TransactionDetail from './transactions/TransactionDetail';

const Transactions = ({ initialType = null, startNewTransaction = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, staff, offlineMode } = useAuth();
  const requestedType = initialType || location.state?.initialTransactionType || null;
  const shouldStartNew = startNewTransaction || location.state?.startNewTransaction;
  const [view, setView] = useState(requestedType ? 'form' : shouldStartNew ? 'type-selector' : 'list'); // 'list', 'type-selector', 'form', 'detail'
  const [selectedType, setSelectedType] = useState(requestedType);
  const [selectedEntryType, setSelectedEntryType] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const operationId = useRef(crypto.randomUUID());

  const handleNewTransaction = () => {
    operationId.current = crypto.randomUUID();
    setSelectedType(null);
    setSelectedEntryType(null);
    setView('type-selector');
  };

  const handleSelectType = (type) => {
    operationId.current = crypto.randomUUID();
    if (type === 'loan-disbursement') {
      navigate('/staff/loan-requests');
      return;
    }

    const formTypes = {
      sales: { form: 'sales' },
      'loan-payment': { form: 'loan-payment', entry: 'loan_payment' },
      'savings-deposit': { form: 'savings-deposit', entry: 'savings_deposit' },
      'time-deposit': { form: 'savings-deposit', entry: 'time_deposit' },
      'savings-withdrawal': { form: 'savings-deposit', entry: 'savings_withdrawal' },
      'time-deposit-withdrawal': { form: 'savings-deposit', entry: 'time_deposit_withdrawal' },
      'capital-contribution': { form: 'other-transaction', entry: 'capital_contribution' },
      'approved-dividend': { form: 'other-transaction', entry: 'dividend_distribution' },
      'other-receipt': { form: 'cash-receipt', entry: 'other-receipt' },
      'operating-expense': { form: 'cash-disbursement', entry: 'operating-expense' },
      'other-disbursement': { form: 'cash-disbursement', entry: 'other-disbursement' },
    };
    const selection = formTypes[type] || { form: type };
    setSelectedType(selection.form);
    setSelectedEntryType(selection.entry || null);
    setView('form');
  };

  const handleCancel = () => {
    operationId.current = crypto.randomUUID();
    setView('list');
    setSelectedType(null);
    setSelectedEntryType(null);
    setSelectedTransaction(null);
  };

  const handleCancelForm = () => {
    operationId.current = crypto.randomUUID();
    setView('type-selector');
    setSelectedType(null);
    setSelectedEntryType(null);
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
    const message = payload?.p_direction === 'cash_in'
      ? 'It will be recorded automatically after server validation. Manager approval is not required.'
      : 'It will remain unposted until the server validates it and the Manager reviews it.';
    setActionNotice(`Pending Sync: saved on this device only. ${message}`);
  };

  const handleSaveTransaction = async (data) => {
    setActionError('');
    setActionNotice('');
    const shouldQueue = !navigator.onLine || offlineMode;
    if (data.action === 'cancel-credit-sale' && shouldQueue) {
      throw new Error('Reconnect before submitting a sales return for approval. Nothing was saved.');
    }

    let transactionType = selectedEntryType;
    let direction = 'cash_in';
    let amount = 0;
    let memberId = null;
    let counterpartyName = null;
    let paymentMethod = null;
    let description = '';

    if (data.type === 'bank-transfer') {
      transactionType = 'bank_transfer';
      direction = 'noncash';
      amount = Number(data.amount);
      counterpartyName = `${data.fromAccount} to ${data.toAccount}`;
      description = data.particulars?.trim() || '';
      data = {
        transfer_date: data.date,
        from_account: data.fromAccount,
        to_account: data.toAccount,
        amount,
        reference_number: data.referenceNumber || null,
        description,
      };
    } else if (selectedType === 'sales') {
      transactionType = data.action === 'cancel-credit-sale' ? 'sales_return' : 'sale';
      const sale = data.p_sale;
      amount = Number(data.amount || sale?.amount || 0);
      direction = data.action === 'cancel-credit-sale' || sale?.payment_type === 'credit'
        ? 'noncash'
        : 'cash_in';
      memberId = sale?.member_id || null;
      counterpartyName = sale?.customer_name || null;
      paymentMethod = sale?.payment_method || null;
      description = data.action === 'cancel-credit-sale'
        ? `Return/cancel sale ${data.p_sales_order_id}`
        : sale?.flow === 'collection'
          ? `Collection for credit sale ${sale.reference_number}`
          : `Sale to ${sale?.customer_name || 'customer'}`;
    } else if (data.dividend) {
      transactionType = 'approved_dividend';
      direction = 'noncash';
      amount = Number(data.p_distribution?.dividend_amount || 0) + Number(data.p_distribution?.patronage_amount || 0);
      memberId = data.p_distribution?.member_id || null;
      description = 'Approved dividend and patronage distribution';
    } else if (data.p_entry) {
      const entryType = data.p_entry.entry_type;
      transactionType = entryType;
      direction = ['savings_withdrawal', 'time_deposit_withdrawal'].includes(entryType)
        ? 'cash_out'
        : 'cash_in';
      amount = Number(data.p_receipt?.amount || data.p_disbursement?.amount || 0);
      memberId = data.p_receipt?.member_id || data.p_disbursement?.member_id || null;
      counterpartyName = data.p_receipt?.received_from || data.p_disbursement?.payee || null;
      paymentMethod = data.p_receipt?.payment_method || null;
      description = data.p_receipt?.description || data.p_disbursement?.description || entryType.replaceAll('_', ' ');
    } else if (selectedType === 'cash-receipt' || data.type === 'cash-receipt') {
      transactionType = 'other_receipt';
      amount = Number(data.amount);
      memberId = data.memberId || null;
      counterpartyName = data.member?.trim() || null;
      paymentMethod = data.paymentMethod || null;
      description = data.particulars?.trim() || '';
      data = {
        p_receipt: {
          receipt_date: data.date,
          received_from: data.member.trim(),
          member_id: data.memberId || null,
          amount,
          payment_method: data.paymentMethod,
          description,
          status: 'recorded',
        },
        p_allocations: data.accountDistribution.map((allocation) => ({
          account: allocation.account,
          amount: Number(allocation.amount),
          side: allocation.side,
          description: allocation.description?.trim() || null,
        })),
      };
    } else if (selectedType === 'cash-disbursement' || data.type === 'cash-disbursement') {
      transactionType = selectedEntryType === 'operating-expense' ? 'operating_expense' : 'other_disbursement';
      direction = 'cash_out';
      amount = Number(data.paymentAmount);
      memberId = data.memberId || null;
      counterpartyName = data.payee || null;
      paymentMethod = data.paymentSource === 'cash-in-bank' ? 'bank_transfer' : 'cash';
      description = data.particulars?.trim() || '';
      data = {
        p_disbursement: {
          disbursement_date: data.date,
          payee: data.payee,
          member_id: data.memberId || null,
          amount,
          payment_source: data.paymentSource,
          description,
          status: 'recorded',
        },
        p_allocations: data.accountAllocations.map((allocation) => ({
          account: allocation.account,
          amount: Number(allocation.amount),
        })),
      };
    } else {
      throw new Error('Unsupported transaction type.');
    }

    if (!transactionType || !Number.isFinite(amount) || amount <= 0 || !description) {
      throw new Error('Transaction details are incomplete; nothing was submitted.');
    }

    const submission = {
      p_submission_key: operationId.current,
      p_transaction_type: transactionType,
      p_direction: direction,
      p_source_module: 'bookkeeper.transactions',
      p_source_record_id: data.action === 'cancel-credit-sale' ? data.p_sales_order_id : null,
      p_member_id: memberId,
      p_counterparty_name: counterpartyName,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_description: description,
      p_payload: data,
    };

    if (shouldQueue) {
      await queueOfflineOperation({
        type: 'transaction_workflow',
        payload: submission,
        entityId: memberId,
        summary: `${transactionType.replaceAll('_', ' ')} ${direction === 'cash_in' ? 'queued for processing' : 'submitted for approval'}`,
        details: { amount, type: transactionType },
      });
    } else {
      const { data: result, error } = await supabase.rpc('submit_transaction_workflow', submission);
      if (error) throw error;
      if (!result?.workflow_id) throw new Error('The server did not confirm the transaction workflow.');
      setActionNotice(direction === 'cash_in'
        ? transactionType === 'loan_payment'
          ? `Loan payment recorded · ${result.workflow_id.slice(0, 8).toUpperCase()}. The loan balance and payment schedule have been updated.`
          : `Incoming transaction recorded automatically · ${result.workflow_id.slice(0, 8).toUpperCase()}. Manager approval is not required.`
        : `Transaction submitted for Manager approval · ${result.workflow_id.slice(0, 8).toUpperCase()}. No accounting entry or cash movement has been finalized.`);
    }

    setView('list');
    operationId.current = crypto.randomUUID();
    setSelectedType(null);
    setSelectedEntryType(null);
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
    setSelectedEntryType(null);
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
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'cash-receipt' && (
        <CashReceiptForm 
          transaction={selectedTransaction}
          title={selectedEntryType === 'other-receipt' ? 'Other Receipt' : 'Cash Receipt'}
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'cash-disbursement' && (
        <CashDisbursementForm 
          transaction={selectedTransaction}
          title={selectedEntryType === 'operating-expense'
            ? 'Operating Expenses'
            : selectedEntryType === 'other-disbursement'
              ? 'Other Disbursements'
              : 'Cash Disbursement Entry'}
          allowExternalPayee={Boolean(selectedEntryType)}
          allowLoanPayable={false}
          onSelectInternalTransfer={selectedEntryType === 'other-disbursement'
            ? () => setSelectedType('bank-transfer')
            : undefined}
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'bank-transfer' && (
        <BankTransferForm onSave={handleSaveTransaction} onCancel={handleCancelForm} />
      )}

      {view === 'form' && selectedType === 'sales' && (
        <SalesForm
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'loan-payment' && (
        <MemberFinancialEntryForm
          initialEntryType={selectedEntryType || 'loan_payment'}
          allowedEntryTypes={selectedEntryType ? [selectedEntryType] : ['loan_payment']}
          title="Loan Payment"
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'savings-deposit' && (
        <MemberFinancialEntryForm
          initialEntryType={selectedEntryType || 'savings_deposit'}
          allowedEntryTypes={selectedEntryType ? [selectedEntryType] : ['savings_deposit', 'savings_withdrawal', 'time_deposit', 'time_deposit_withdrawal']}
          title={{
            savings_deposit: 'Savings Deposit',
            time_deposit: 'Time Deposit',
            savings_withdrawal: 'Savings Withdrawal',
            time_deposit_withdrawal: 'Time Deposit Withdrawal',
          }[selectedEntryType] || 'Savings / Deposit'}
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
        />
      )}

      {view === 'form' && selectedType === 'other-transaction' && (
        <MemberFinancialEntryForm
          initialEntryType={selectedEntryType || 'capital_contribution'}
          allowedEntryTypes={selectedEntryType ? [selectedEntryType] : ['capital_contribution', 'dividend_distribution']}
          title={selectedEntryType === 'dividend_distribution' ? 'Approved Dividends' : 'Capital Contribution'}
          onSave={handleSaveTransaction}
          onCancel={handleCancelForm}
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
