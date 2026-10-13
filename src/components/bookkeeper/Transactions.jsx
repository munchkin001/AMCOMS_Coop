import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import TransactionList from './transactions/TransactionList';
import TransactionTypeSelector from './transactions/TransactionTypeSelector';
import CashReceiptForm from './transactions/CashReceiptForm';
import CashDisbursementForm from './transactions/CashDisbursementForm';
import MemberFinancialEntryForm from './transactions/MemberFinancialEntryForm';
import SalesForm from './transactions/SalesForm';
import TransactionDetail from './transactions/TransactionDetail';

const Transactions = ({ initialType = null, startNewTransaction = false }) => {
  const location = useLocation();
  const requestedType = initialType || location.state?.initialTransactionType || null;
  const shouldStartNew = startNewTransaction || location.state?.startNewTransaction;
  const [view, setView] = useState(requestedType ? 'form' : shouldStartNew ? 'type-selector' : 'list'); // 'list', 'type-selector', 'form', 'detail'
  const [selectedType, setSelectedType] = useState(requestedType);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [actionError, setActionError] = useState('');

  const handleNewTransaction = () => {
    setView('type-selector');
  };

  const handleSelectType = (type) => {
    setSelectedType(type);
    setView('form');
  };

  const handleCancel = () => {
    setView('list');
    setSelectedType(null);
    setSelectedTransaction(null);
  };

  const handleSaveTransaction = async (data) => {
    setActionError('');
    if (selectedType === 'sales') {
      const { error } = await supabase.rpc('record_cooperative_sale', data);
      if (error) throw error;
    } else if (['loan-payment', 'savings-deposit', 'other-transaction'].includes(selectedType)) {
      const { error } = data.dividend
        ? await supabase.rpc('record_member_dividend', { p_distribution: data.p_distribution })
        : await supabase.rpc('record_member_financial_entry', data);
      if (error) throw error;
    } else if (selectedType === 'cash-receipt' || data.type === 'cash-receipt') {
      const { error } = await supabase.rpc('save_cash_receipt', {
        p_receipt: {
          receipt_date: data.date,
          receipt_number: data.receiptNo.trim(),
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
      });

      if (error) throw error;
    } else if (selectedType === 'cash-disbursement' || data.type === 'cash-disbursement') {
      const { error } = await supabase.rpc('save_cash_disbursement', {
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
      });

      if (error) throw error;
    } else {
      throw new Error('Unsupported transaction type.');
    }

    setView('list');
    setSelectedType(null);
    setSelectedTransaction(null);
  };

  const handleViewTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setView('detail');
  };

  const handleEditTransaction = (transaction) => {
    setSelectedTransaction(transaction);
    setSelectedType(transaction.type);
    setView('form');
  };

  const handleDeleteTransaction = async (transaction) => {
    setActionError('');
    const fn = transaction.type === 'cash-disbursement' ? 'delete_cash_disbursement' : 'delete_cash_receipt';
    const param = transaction.type === 'cash-disbursement' ? 'p_disbursement_id' : 'p_receipt_id';
    const { error } = await supabase.rpc(fn, { [param]: transaction.id });
    if (error) {
      setActionError(`Unable to delete transaction: ${error.message}`);
      return;
    }
    setView('list');
    setSelectedTransaction(null);
  };

  return (
    <div>
      {actionError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}
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
