import { useState } from 'react';
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Download, 
  FileText, 
  Calendar,
  DollarSign,
  Building,
  Receipt,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';

const TransactionDetail = ({ transaction, onBack, onEdit, onDelete }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const getTypeConfig = (type) => {
    const configs = {
      'cash-receipt': {
        label: 'Cash Receipt',
        icon: ArrowLeft,
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200'
      },
      'cash-disbursement': {
        label: 'Cash Disbursement',
        icon: ArrowLeft,
        bgColor: 'bg-red-50',
        textColor: 'text-red-700',
        borderColor: 'border-red-200'
      },
      sale: {
        label: 'Sales',
        icon: Receipt,
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200'
      }
    };
    return configs[type] || configs['cash-receipt'];
  };

  const getStatusConfig = (status) => {
    const configs = {
      'draft': {
        label: 'Draft',
        icon: Clock,
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-200'
      },
      'recorded': {
        label: 'Recorded',
        icon: CheckCircle,
        bgColor: 'bg-green-50',
        textColor: 'text-green-700',
        borderColor: 'border-green-200'
      },
      'credit': {
        label: 'Credit',
        icon: Clock,
        bgColor: 'bg-amber-50',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200'
      },
      'void': {
        label: 'Voided',
        icon: AlertCircle,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200'
      },
      'voided': {
        label: 'Voided',
        icon: AlertCircle,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700',
        borderColor: 'border-gray-200'
      }
    };
    return configs[status] || configs['recorded'];
  };

  const typeConfig = getTypeConfig(transaction.type);
  const statusKey = String(transaction.status || '').toLowerCase();
  const statusConfig = getStatusConfig(statusKey);
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(transaction, voidReason.trim());
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back to Transactions</span>
          </button>

          {!transaction.readOnly && <div className="flex gap-2">
            {statusKey === 'draft' && transaction.type !== 'sale' && (
              <button
                onClick={() => onEdit(transaction)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}
            {['cash-receipt', 'cash-disbursement'].includes(transaction.type)
              && statusKey !== 'voided' && statusKey !== 'void' && <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>{transaction.type === 'cash-receipt' ? 'Void' : 'Delete'}</span>
            </button>}
          </div>}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className={`${typeConfig.bgColor} ${typeConfig.textColor} p-3 rounded-lg`}>
            <TypeIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{typeConfig.label}</h1>
            <p className="text-gray-600">{transaction.referenceNo}</p>
          </div>
        </div>

        <div className={`inline-flex items-center gap-2 px-3 py-1 ${statusConfig.bgColor} ${statusConfig.textColor} ${statusConfig.borderColor} border rounded-full text-sm font-medium`}>
          <StatusIcon className="w-4 h-4" />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* Transaction Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Information</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
              <Calendar className="w-4 h-4" />
              Date
            </label>
            <p className="text-gray-900">{formatDate(transaction.date)}</p>
          </div>

          {transaction.repCvNumber && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                <Receipt className="w-4 h-4" />
                {transaction.type === 'cash-receipt'
                  ? 'OR #'
                  : transaction.type === 'sale' ? 'Sale reference' : 'Rep./CV #'}
              </label>
              <p className="text-gray-900">{transaction.repCvNumber}</p>
            </div>
          )}

          {transaction.receiptNumber && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                <Receipt className="w-4 h-4" />
                Official Receipt
              </label>
              <p className="text-gray-900">{transaction.receiptNumber}</p>
            </div>
          )}

          {transaction.paymentSource && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
                <Building className="w-4 h-4" />
                Payment Source
              </label>
              <p className="text-gray-900">
                {transaction.paymentSource === 'cash-on-hand' ? 'Cash on Hand' : 'Cash in Bank'}
              </p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
              <DollarSign className="w-4 h-4" />
              Amount
            </label>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(transaction.amount || transaction.paymentAmount)}
            </p>
          </div>
        </div>

        {transaction.voidReason && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">Void reason</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-red-800">{transaction.voidReason}</p>
            {transaction.voidedAt && (
              <p className="mt-1 text-xs text-red-700">Voided {formatDate(transaction.voidedAt)}</p>
            )}
          </div>
        )}

        {transaction.particulars && (
          <div className="mt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-1">
              <FileText className="w-4 h-4" />
              Particulars
            </label>
            <p className="text-gray-900 whitespace-pre-wrap">{transaction.particulars}</p>
          </div>
        )}
      </div>

      {/* Account Allocations */}
      {transaction.accountAllocations && transaction.accountAllocations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Allocations</h2>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Side
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transaction.accountAllocations.map((allocation, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {allocation.account}
                    </td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-600">
                      {allocation.side || 'debit'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(allocation.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="2" className="px-4 py-3 text-sm font-semibold text-gray-900">
                    Debits / Credits
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(transaction.accountAllocations.filter((allocation) => (allocation.side || 'debit') === 'debit').reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0))}
                    {' / '}
                    {formatCurrency(transaction.accountAllocations.filter((allocation) => allocation.side === 'credit').reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Supporting Documents */}
      {transaction.supportingDocuments && transaction.supportingDocuments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Supporting Documents</h2>
          
          <div className="space-y-2">
            {transaction.supportingDocuments.map((doc, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-900">{doc.name || `Document ${index + 1}`}</span>
                </div>
                <button
                  onClick={() => console.log('Download:', doc)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Trail</h2>
        
        <div className="space-y-3">
          {transaction.submittedAt && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {transaction.status === 'draft' ? 'Saved as Draft' : 'Recorded'}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(transaction.submittedAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )}
          
          {transaction.createdBy && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 mt-2 rounded-full bg-gray-300"></div>
              <div>
                <p className="text-sm font-medium text-gray-900">Created by</p>
                <p className="text-xs text-gray-500">{transaction.createdBy}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-50 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {transaction.type === 'cash-receipt' ? 'Void Cash Receipt' : 'Delete Transaction'}
                </h3>
                <p className="text-sm text-gray-600">
                  {transaction.type === 'cash-receipt'
                    ? `Voiding retains receipt ${transaction.repCvNumber || ''} and its audit history, reverses its accounting entries, and requires an online connection.`
                    : 'Are you sure you want to delete this transaction? This action cannot be undone.'}
                </p>
              </div>
            </div>

            {transaction.type === 'cash-receipt' && (
              <label className="mb-4 block text-sm font-medium text-gray-700">
                Reason for voiding *
                <textarea
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setVoidReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={transaction.type === 'cash-receipt' && !voidReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {transaction.type === 'cash-receipt' ? 'Void receipt' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionDetail;
