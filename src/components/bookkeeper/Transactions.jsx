import React, { useState } from 'react';
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

  const handleSaveTransaction = (data) => {
    console.log('Saving transaction:', data);
    // TODO: Save to backend
    alert(`Transaction ${data.status === 'draft' ? 'saved as draft' : 'recorded'} successfully!`);
    setView('list');
    setSelectedType(null);
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

  const handleDeleteTransaction = (transaction) => {
    console.log('Deleting transaction:', transaction);
    // TODO: Delete from backend
    alert(`Transaction ${transaction.referenceNo} deleted successfully!`);
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
