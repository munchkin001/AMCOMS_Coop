import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import TransactionList from './transactions/TransactionList';
import TransactionTypeSelector from './transactions/TransactionTypeSelector';
import CashReceiptForm from './transactions/CashReceiptForm';
import CashDisbursementForm from './transactions/CashDisbursementForm';
import TransactionDetail from './transactions/TransactionDetail';

const Transactions = () => {
  const [view, setView] = useState('list'); // 'list', 'type-selector', 'form', 'detail'
  const [selectedType, setSelectedType] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

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
    if (selectedType === 'cash-receipt' || data.type === 'cash-receipt') {
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
    const fn = transaction.type === 'cash-disbursement' ? 'delete_cash_disbursement' : 'delete_cash_receipt';
    const param = transaction.type === 'cash-disbursement' ? 'p_disbursement_id' : 'p_receipt_id';
    const { error } = await supabase.rpc(fn, { [param]: transaction.id });
    if (error) {
      alert(error.message);
      return;
    }
    setView('list');
    setSelectedTransaction(null);
  };

  return (
    <div>
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
