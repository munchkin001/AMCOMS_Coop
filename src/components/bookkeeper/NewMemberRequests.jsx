import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, UserPlus, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorAlert from '../common/ErrorAlert';

const presetReasons = {
  approved: [
    'Thank you for applying! Your application has been approved. Welcome to the cooperative!',
    'Your application has been approved. Please visit the office to complete your membership requirements.'
  ],
  rejected: [
    'Please visit the office before submitting a membership application.',
    'Your application is incomplete. Please visit the office with a valid ID to complete the requirements.',
    'We could not verify the information you provided. Please visit the office for assistance.',
    'An application or membership already exists for you. Please contact the office for details.'
  ]
};

const filters = [
  { key: 'pending', label: 'New member requests' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' }
];

const statusStyles = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200'
};

const statusLabel = (status) => (status === 'pending' ? 'New member request' : status.charAt(0).toUpperCase() + status.slice(1));
const fullName = (application) => [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' ');

const NewMemberRequests = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [review, setReview] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchApplications = useCallback(async () => {
    try {
      setError('');
      const { data, error: fetchError } = await supabase
        .from('member_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setApplications(data || []);
    } catch (err) {
      console.error('Error fetching member requests:', err);
      setError('Member requests could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useRealtimeSubscription('member_applications', fetchApplications, null, [fetchApplications]);

  const openReview = (application, decision) => {
    setReview({ application, decision });
    setReason('');
    setError('');
  };

  const closeReview = () => {
    if (processing) return;
    setReview(null);
    setReason('');
  };

  const submitReview = async () => {
    if (!reason.trim()) return;
    setProcessing(true);
    setError('');
    try {
      const { error: reviewError } = await supabase.rpc('review_member_application', {
        p_application_id: review.application.id,
        p_decision: review.decision,
        p_reason: reason.trim()
      });
      if (reviewError) throw reviewError;
      const applicationId = review.application.id;
      const decision = review.decision;
      const decidedReason = reason.trim();
      setApplications((current) => current.map((item) => (item.id === applicationId
        ? { ...item, status: decision, review_notes: decidedReason, rejection_reason: decision === 'rejected' ? decidedReason : null }
        : item)));
      setReview(null);
      setReason('');
      fetchApplications();
      const { error: emailError } = await supabase.functions.invoke('member-request-email', {
        body: { application_id: applicationId }
      });
      if (emailError) {
        setError('The decision was saved, but the email to the applicant could not be sent. Please contact them directly.');
      }
    } catch (err) {
      console.error('Error reviewing member request:', err);
      setError(err.message || 'The request could not be updated. Please try again.');
      setReview((current) => current && { ...current, failed: true });
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = applications.filter((application) => application.status === 'pending').length;
  const visible = filter === 'all' ? applications : applications.filter((application) => application.status === filter);

  if (loading) return <LoadingSpinner />;

  const approving = review?.decision === 'approved';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Member Requests</h2>
        </div>
        {pendingCount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 font-semibold text-amber-800">{pendingCount} new</div>
        )}
      </div>

      {error && !review && <ErrorAlert message={error} />}

      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === key ? 'bg-blue-700 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
          >
            {label} <span className={filter === key ? 'text-blue-100' : 'text-gray-500'}>({key === 'all' ? applications.length : applications.filter((application) => application.status === key).length})</span>
                      </button>
                    ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm">
          <UserPlus aria-hidden="true" className="mx-auto mb-3 size-12 text-gray-300" />
          <p className="text-gray-600">No {filter === 'pending' ? 'new member requests' : filter === 'all' ? 'member requests' : `${filter} requests`} found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {visible.map((application) => (
            <article key={application.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{fullName(application)}</h3>
                  <p className="text-gray-600">{application.email}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Requested {new Date(application.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${statusStyles[application.status] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  {application.status === 'approved' ? <CheckCircle2 aria-hidden="true" size={16} /> : application.status === 'rejected' ? <XCircle aria-hidden="true" size={16} /> : <Clock3 aria-hidden="true" size={16} />}
                  {statusLabel(application.status)}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-900">{application.phone || 'Not provided'}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-gray-600">Address</p>
                  <p className="font-medium text-gray-900">{application.address || 'Not provided'}</p>
                </div>
              </div>

              {application.status !== 'pending' && (application.review_notes || application.rejection_reason) && (
                <div className={`mb-4 rounded border-l-4 p-3 ${application.status === 'approved' ? 'border-emerald-500 bg-emerald-50' : 'border-rose-500 bg-rose-50'}`}>
                  <p className="mb-1 text-sm font-medium text-gray-600">Reason given</p>
                  <p className="text-gray-900">{application.review_notes || application.rejection_reason}</p>
                </div>
              )}

              {application.status === 'pending' && (
                <div className="flex gap-3">
                  <button type="button" onClick={() => openReview(application, 'approved')} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition-colors hover:bg-emerald-700">
                    Approve
                  </button>
                  <button type="button" onClick={() => openReview(application, 'rejected')} className="flex-1 rounded-lg bg-rose-600 px-4 py-3 font-medium text-white transition-colors hover:bg-rose-700">
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 id="review-title" className="text-xl font-bold text-gray-900">{approving ? 'Approve' : 'Reject'} request</h3>
            </div>

            <p className="mb-3 text-gray-600">
              Choose a ready-made reason or write your own for <strong>{fullName(review.application)}</strong>.
            </p>

            <div className="mb-3 space-y-2">
              {presetReasons[review.decision].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${reason === preset ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <label htmlFor="review-reason" className="mb-1 block text-sm font-medium text-gray-700">Reason (you can edit this)</label>
            <textarea
              id="review-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder="Type a reason..."
            />

            {error && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={closeReview} disabled={processing} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={processing || !reason.trim()}
                className={`flex-1 rounded-lg px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${approving ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                {processing ? 'Saving...' : approving ? 'Approve request' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMemberRequests;
