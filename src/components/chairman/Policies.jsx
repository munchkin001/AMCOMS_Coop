import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock3, FileText, HandCoins, Package, PiggyBank, Plus, Users, WalletCards, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';

const categoryIcons = {
  Loans: HandCoins,
  Members: Users,
  Savings: PiggyBank,
  Inventory: Package,
  Financial: WalletCards,
  General: ClipboardList
};

const Policies = () => {
  const { staff } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [policyToPublish, setPolicyToPublish] = useState(null);
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [policies, setPolicies] = useState([]);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    category: '',
    content: '',
    status: 'draft'
  });

  const formatPolicy = (policy) => ({
    ...policy,
    lastUpdated: new Date(policy.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    publishedDate: policy.published_at
      ? new Date(policy.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null,
    publishedBy: policy.published_by
  });

  const loadPolicies = useCallback(async () => {
    try {
      const { data, error: loadError } = await supabase
        .from('policies')
        .select('id, name, category, content, status, published_at, published_by, updated_at')
        .order('updated_at', { ascending: false });
      if (loadError) throw loadError;
      const refreshedPolicies = (data || []).map(formatPolicy);
      setPolicies(refreshedPolicies);
      setSelectedPolicy((current) => current
        ? refreshedPolicies.find((policy) => policy.id === current.id) || null
        : current);
      setError('');
    } catch (loadError) {
      console.error('Error loading policies:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'policies'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  useMultipleRealtimeSubscriptions(
    [{ table: 'policies', onUpdate: loadPolicies }],
    [loadPolicies]
  );

  const handleCreatePolicy = async () => {
    if (!policyForm.name.trim() || !policyForm.category || !policyForm.content.trim()) {
      setError('Policy name, category, and content are required.');
      return;
    }

    setSaving(true);
    try {
      const isPublished = policyForm.status === 'published';
      const payload = {
        name: policyForm.name.trim(),
        category: policyForm.category,
        content: policyForm.content.trim(),
        status: policyForm.status,
        published_at: isPublished ? new Date().toISOString() : null,
        published_by: isPublished ? staff?.full_name || null : null
      };
      const query = editingPolicyId
        ? supabase.from('policies').update(payload).eq('id', editingPolicyId)
        : supabase.from('policies').insert(payload);
      const { data, error: saveError } = await query
        .select('id, name, category, content, status, published_at, published_by, updated_at')
        .single();
      if (saveError) throw saveError;

      const savedPolicy = formatPolicy(data);
      setPolicies((current) => [
        savedPolicy,
        ...current.filter((policy) => policy.id !== savedPolicy.id)
      ]);
      setPolicyForm({ name: '', category: '', content: '', status: 'draft' });
      setEditingPolicyId(null);
      setShowCreateModal(false);
      setError('');
    } catch (saveError) {
      console.error('Error saving policy:', saveError);
      setError(`Unable to save policy: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublishPolicy = (policyId) => {
    setPolicyToPublish(policyId);
    setShowPublishModal(true);
  };

  const confirmPublishPolicy = async () => {
    const { data, error: publishError } = await supabase
      .from('policies')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: staff?.full_name || null
      })
      .eq('id', policyToPublish)
      .select('id, name, category, content, status, published_at, published_by, updated_at')
      .single();

    if (publishError) {
      console.error('Error publishing policy:', publishError);
      setError(`Unable to publish policy: ${publishError.message}`);
      return;
    }

    const publishedPolicy = formatPolicy(data);
    setPolicies((current) => current.map((policy) =>
      policy.id === publishedPolicy.id ? publishedPolicy : policy
    ));
    setShowPublishModal(false);
    setPolicyToPublish(null);
    setError('');
  };

  const handleEditPolicy = (policy) => {
    setPolicyForm({
      name: policy.name,
      category: policy.category,
      content: policy.content,
      status: policy.status
    });
    setEditingPolicyId(policy.id);
    setShowCreateModal(true);
  };

  const handleViewPolicy = (policy) => {
    setSelectedPolicy(policy);
    setShowViewModal(true);
  };

  const getStatusColor = (status) => {
    return status === 'published' 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-yellow-100 text-yellow-800 border-yellow-200';
  };

  const getCategoryIcon = (category, className = 'h-5 w-5') => {
    const CategoryIcon = categoryIcons[category] || ClipboardList;
    return <CategoryIcon aria-hidden="true" className={className} />;
  };

  return (
    <div className="space-y-6 pb-8">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-sm font-medium text-slate-600">Manage cooperative policies and governance documents</p>
          <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live updates enabled
          </p>
        </div>
        <button
          onClick={() => {
            setPolicyForm({ name: '', category: '', content: '', status: 'draft' });
            setEditingPolicyId(null);
            setShowCreateModal(true);
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
          <span>Create Policy</span>
        </button>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Total policies</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{policies.length}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileText aria-hidden="true" className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Published</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-700">
                {policies.filter(p => p.status === 'published').length}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Drafts</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-700">
                {policies.filter(p => p.status === 'draft').length}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Clock3 aria-hidden="true" className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Policy library</h2>
            <p className="mt-1 text-sm text-slate-500">Policies are kept current across connected views.</p>
          </div>
        </div>
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading policies...</p>
        ) : policies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <FileText aria-hidden="true" className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-900">No policies yet</p>
            <p className="mt-1 text-sm text-slate-500">Create a policy to begin building your governance library.</p>
          </div>
        ) : policies.map((policy) => (
          <article key={policy.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{getCategoryIcon(policy.category)}</span>
                  <h3 className="text-base font-semibold text-slate-900">{policy.name}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${getStatusColor(policy.status)}`}>
                    {policy.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{policy.content}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                  <span>Category <span className="font-semibold text-slate-700">{policy.category}</span></span>
                  <span>Updated <span className="font-semibold text-slate-700">{policy.lastUpdated}</span></span>
                  {policy.status === 'published' && (
                    <span>Published <span className="font-semibold text-slate-700">{policy.publishedDate}</span></span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <button
                  onClick={() => handleViewPolicy(policy)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  View
                </button>
                <button
                  onClick={() => handleEditPolicy(policy)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  Edit
                </button>
                {policy.status === 'draft' && (
                  <button
                    onClick={() => handlePublishPolicy(policy.id)}
                    className="min-h-10 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                  >
                    Publish
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Create/Edit Policy Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{editingPolicyId ? 'Edit policy' : 'Create new policy'}</h3>
                  <p className="mt-1 text-sm text-slate-500">Provide clear details for this governance document.</p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close policy form"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Policy Name *
                </label>
                <input
                  type="text"
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  placeholder="e.g., Loan Collection Policy"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Category *
                </label>
                <select
                  value={policyForm.category}
                  onChange={(e) => setPolicyForm({ ...policyForm, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="">Select Category</option>
                  <option value="Loans">Loans</option>
                  <option value="Members">Members</option>
                  <option value="Savings">Savings</option>
                  <option value="Inventory">Inventory</option>
                  <option value="Financial">Financial</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Policy Content *
                </label>
                <textarea
                  value={policyForm.content}
                  onChange={(e) => setPolicyForm({ ...policyForm, content: e.target.value })}
                  placeholder="Enter the full policy content..."
                  rows={10}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={policyForm.status}
                  onChange={(e) => setPolicyForm({ ...policyForm, status: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  <option value="draft">Draft (Save for later)</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                onClick={handleCreatePolicy}
                disabled={saving}
                className="min-h-10 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
              {saving ? 'Saving...' : policyForm.status === 'published' ? 'Save & Publish' : editingPolicyId ? 'Save Changes' : 'Save as Draft'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingPolicyId(null);
                }}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Policy Modal */}
      {showViewModal && selectedPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setShowViewModal(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{getCategoryIcon(selectedPolicy.category, 'h-5 w-5')}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selectedPolicy.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedPolicy.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowViewModal(false)}
                  aria-label="Close policy details"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="mb-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold border ${getStatusColor(selectedPolicy.status)}`}>
                      {selectedPolicy.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{selectedPolicy.lastUpdated}</p>
                  </div>
                  {selectedPolicy.status === 'published' && (
                    <>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Published by</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{selectedPolicy.publishedBy || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Published date</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{selectedPolicy.publishedDate}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Policy content</h4>
                <div className="mt-3 rounded-xl bg-slate-50 p-4 sm:p-5">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedPolicy.content}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  handleEditPolicy(selectedPolicy);
                }}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                Edit Policy
              </button>
              <button
                onClick={() => setShowViewModal(false)}
                className="min-h-10 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Publish Policy</h3>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to publish this policy?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowPublishModal(false);
                    setPolicyToPublish(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPublishPolicy}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Publish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Policies;
