import React, { useCallback, useEffect, useMemo, useState } from 'react';
import EmptyState from '../common/EmptyState';
import InfoIcon from '../common/InfoIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { supabase } from '../../lib/supabase';

const requestTypeLabels = {
  loan_application: 'Loan Application',
  withdrawal: 'Withdrawal',
  loan_release: 'Loan Release',
  membership: 'Membership',
  other: 'Other Request'
};

const getStatusColor = (status) => {
  const colors = {
    pending: 'yellow',
    under_review: 'blue',
    approved: 'green',
    completed: 'green',
    rejected: 'red',
    cancelled: 'gray'
  };
  return colors[status] || 'gray';
};

const emptyForm = { amount: '', loanType: 'Agricultural Loan', purpose: '', termMonths: 12, frequency: 'monthly' };
const peso = (value) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatRequest = (request) => ({
  ...request,
  type: request.request_data?.type || requestTypeLabels[request.request_type] || 'Request',
  date: request.created_at
    ? new Date(request.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Date unavailable',
  amountLabel: request.amount == null
    ? '—'
    : `₱${Number(request.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
  statusLabel: request.status?.replaceAll('_', ' ') || 'pending',
  color: getStatusColor(request.status)
});

const MemberRequests = () => {
  const { staff } = useAuth();
  const [activeTab, setActiveTab] = useState('submit');
  const [requestType, setRequestType] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyForm);
  const [termOptions, setTermOptions] = useState([]);

  useEffect(() => {
    supabase
      .from('loan_term_options')
      .select('term_months, payment_frequency, annual_rate, penalty_rate')
      .order('term_months')
      .then(({ data }) => setTermOptions(data || []));
  }, []);

  const quote = useMemo(() => {
    const amount = Number(requestForm.amount);
    const option = termOptions.find((item) => item.term_months === Number(requestForm.termMonths) && item.payment_frequency === requestForm.frequency);
    if (!option || !(amount > 0)) return null;
    const count = option.payment_frequency === 'weekly' ? Math.round(option.term_months * 52 / 12) : option.term_months;
    const interest = Math.round(amount * option.annual_rate * option.term_months / 12) / 100;
    const total = amount + interest;
    return { ...option, count, interest, total, installment: total / count };
  }, [requestForm.amount, requestForm.termMonths, requestForm.frequency, termOptions]);

  const fetchRequests = useCallback(async () => {
    if (!staff?.member_id) {
      setRequests([]);
      setLoadingRequests(false);
      return;
    }

    setRequestError('');
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('id, request_number, request_type, request_data, amount, status, created_at, updated_at')
        .eq('member_id', staff.member_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data || []).map(formatRequest));
    } catch (error) {
      console.error('Unable to load member requests:', error);
      setRequestError('Your request history could not be loaded. Please try again.');
    } finally {
      setLoadingRequests(false);
    }
  }, [staff?.member_id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useRealtimeSubscription(
    'requests',
    fetchRequests,
    staff?.member_id ? { column: 'member_id', value: staff.member_id } : null,
    [staff?.member_id],
    Boolean(staff?.member_id)
  );

  const getStatusColor = (color) => {
    const colors = {
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      gray: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[color];
  };

  const handleRequestClick = (type) => {
    setRequestType(type);
    setRequestForm(emptyForm);
    setSubmissionError('');
    setShowRequestModal(true);
  };

  const handleRequestSubmit = async (event) => {
    event.preventDefault();
    if (!staff?.member_id) {
      setSubmissionError('Your member profile could not be verified. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setSubmissionError('');
    try {
      const { error } = await supabase.rpc('submit_loan_request', {
        p_amount: Number(requestForm.amount),
        p_loan_type: requestForm.loanType,
        p_purpose: requestForm.purpose.trim(),
        p_term_months: Number(requestForm.termMonths),
        p_frequency: requestForm.frequency
      });

      if (error) throw error;
      setShowRequestModal(false);
      setActiveTab('history');
      await fetchRequests();
    } catch (error) {
      console.error('Unable to submit member request:', error);
      setSubmissionError(error.message || 'Your request could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('submit')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'submit'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Submit New Request
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Request History
            </button>
          </div>
        </div>

        {/* Submit New Request Tab */}
        {activeTab === 'submit' && (
          <div className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Choose Request Type</h3>
              <InfoIcon text="Select a request type to submit. After approval, visit the office to complete the transaction." position="right" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:max-w-sm">
              <button
                onClick={() => handleRequestClick('Loan Application')}
                className="p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Loan Application</h4>
                <p className="text-sm text-gray-600">Apply for a new loan</p>
              </button>
            </div>
          </div>
        )}

        {/* Request History Tab */}
        {activeTab === 'history' && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request History</h3>
            {requestError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{requestError}</p>}
            {loadingRequests ? (
              <p className="py-6 text-center text-sm text-gray-500">Loading request history...</p>
            ) : requests.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                title="No Requests Yet"
                description="You haven't submitted any requests yet. Use the 'Submit New Request' tab to create your first loan application."
                actionLabel="Submit Request"
                onAction={() => setActiveTab('submit')}
              />
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-semibold text-gray-900">{request.type}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.color)}`}>
                            {request.statusLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          <span>Submitted: {request.date}</span>
                          <span className="mx-2">•</span>
                          <span>Amount: {request.amountLabel}</span>
                        </div>
                      </div>
                      <button className="px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Information Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">Request Processing</p>
            <p className="text-sm text-blue-700 mt-1">
              Once your request is approved, please visit the cooperative office to complete the financial transaction. The website is for request submission only - no online payments are processed.
            </p>
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">{requestType}</h3>
              <form onSubmit={handleRequestSubmit} className="space-y-4">
                {submissionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submissionError}</p>}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={requestForm.amount}
                    onChange={(event) => setRequestForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="Enter amount"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                {requestType === 'Loan Application' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Loan Type</label>
                      <select value={requestForm.loanType} onChange={(event) => setRequestForm((current) => ({ ...current, loanType: event.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <option>Agricultural Loan</option>
                        <option>Business Loan</option>
                        <option>Emergency Loan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Purpose</label>
                      <textarea
                        rows={3}
                        required
                        value={requestForm.purpose}
                        onChange={(event) => setRequestForm((current) => ({ ...current, purpose: event.target.value }))}
                        placeholder="Describe the purpose of the loan"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Payment Schedule</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['monthly', 'weekly'].map((frequency) => (
                          <button
                            key={frequency}
                            type="button"
                            onClick={() => setRequestForm((current) => ({ ...current, frequency }))}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${requestForm.frequency === frequency ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-300 text-gray-700'}`}
                          >
                            {frequency}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Loan Term</label>
                      <select value={requestForm.termMonths} onChange={(event) => setRequestForm((current) => ({ ...current, termMonths: event.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        {[...new Set(termOptions.filter((item) => item.payment_frequency === requestForm.frequency).map((item) => item.term_months))].map((months) => (
                          <option key={months} value={months}>{months / 12} {months === 12 ? 'year' : 'years'}</option>
                        ))}
                      </select>
                    </div>
                    {quote && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                        <div className="flex justify-between"><span className="text-gray-600">Interest ({quote.annual_rate}% per year)</span><span>{peso(quote.interest)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Total to pay</span><span className="font-semibold">{peso(quote.total)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">{quote.count} {quote.payment_frequency} payments of</span><span className="font-semibold text-green-700">{peso(quote.installment)}</span></div>
                        <p className="pt-1 text-xs text-gray-500">Late payments are charged {quote.penalty_rate}% of the missed installment. Rates are estimates until approved.</p>
                      </div>
                    )}
                  </>
                )}
                <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberRequests;
