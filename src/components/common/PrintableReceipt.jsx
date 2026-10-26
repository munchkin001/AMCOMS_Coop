import { useState } from 'react';
import { Printer, X } from 'lucide-react';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatMoney = (value) => `₱${Math.abs(Number(value) || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const PrintableReceipt = ({
  receiptNumber,
  date,
  issuedTo,
  description,
  amount,
  paymentMethod,
  status,
  receivedBy,
  quantity = 1,
  amountPaid,
  documentType = 'receipt',
  reference
}) => {
  const [open, setOpen] = useState(false);
  if (!receiptNumber) return null;

  const isInvoice = documentType === 'invoice';
  const isVoided = ['void', 'voided', 'cancelled'].includes(String(status || '').toLowerCase());
  const title = isInvoice ? 'Sales Invoice' : 'Official Receipt';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#183b34] px-3 py-2 text-sm font-medium text-[#183b34] hover:bg-[#183b34]/5"
      >
        <Printer size={16} aria-hidden="true" />
        Print {isInvoice ? 'invoice' : 'receipt'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="print-document-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-6">
            <div className="no-print mb-4 flex justify-end gap-2">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-[#183b34] px-4 py-2 text-sm font-medium text-white hover:bg-[#102e28]">
                <Printer size={16} aria-hidden="true" />Print
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <article className="amcoms-print-document rounded-lg border border-gray-300 p-6 sm:p-10">
              <header className="amcoms-document-header flex items-start justify-between gap-4 border-b-4 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">Agay-ayan Multi-Purpose Cooperative</p>
                  <p className="mt-1 text-xs text-gray-600">AMCOMS</p>
                </div>
                <div className="text-right">
                  <h1 id="print-document-title" className="text-xl font-bold uppercase tracking-wide">{title}</h1>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{receiptNumber}</p>
                </div>
              </header>

              {isVoided && <p className="mt-5 rounded border border-red-700 px-3 py-2 text-center text-sm font-bold uppercase tracking-[0.2em] text-red-800">Void</p>}

              <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{isInvoice ? 'Bill to' : 'Received from'}</dt><dd className="mt-1 font-medium text-gray-900">{issuedTo || '—'}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</dt><dd className="mt-1 font-medium text-gray-900">{formatDate(date)}</dd></div>
                {reference && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reference</dt><dd className="mt-1 text-gray-900">{reference}</dd></div>}
                {paymentMethod && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment method</dt><dd className="mt-1 capitalize text-gray-900">{paymentMethod.replaceAll('-', ' ')}</dd></div>}
              </dl>

              <table className="mt-8 text-sm">
                <thead>
                  <tr className="border-y-2 border-[#183b34] text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="py-3 pr-4">{isInvoice ? 'Description' : 'Particulars'}</th>
                    <th className="py-3 px-2 text-right">Qty</th>
                    <th className="py-3 px-2 text-right">Unit price</th>
                    <th className="py-3 pl-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-4 pr-4">{description || 'Payment received'}</td>
                    <td className="py-4 px-2 text-right">{Number(quantity) || 1}</td>
                    <td className="py-4 px-2 text-right">{formatMoney((Number(amount) || 0) / (Number(quantity) || 1))}</td>
                    <td className="py-4 pl-2 text-right font-medium">{formatMoney(amount)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-5 flex justify-end">
                <div className="w-full max-w-xs border-t-2 border-[#183b34] pt-3">
                  <div className="flex justify-between gap-4 text-base font-bold">
                    <span>{isInvoice ? 'Invoice total' : 'Total received'}</span><span>{formatMoney(amount)}</span>
                  </div>
                  {isInvoice && amountPaid !== undefined && (
                    <>
                      <div className="mt-2 flex justify-between gap-4 text-sm text-gray-700">
                        <span>Paid to date</span><span>{formatMoney(amountPaid)}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4 border-t border-gray-300 pt-2 text-sm font-semibold">
                        <span>Balance due</span><span>{formatMoney(Math.max(Number(amount) - Number(amountPaid), 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <footer className="document-signatures grid grid-cols-2 gap-10 pt-10 text-center text-xs text-gray-700">
                <div className="border-t border-gray-700 pt-2">{isInvoice ? 'Customer' : 'Received by'}</div>
                <div className="border-t border-gray-700 pt-2">{receivedBy || 'Authorized representative'}</div>
              </footer>
            </article>
          </section>
        </div>
      )}
    </>
  );
};

export default PrintableReceipt;
