import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';

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
      setPolicies((data || []).map(formatPolicy));
      setError('');
    } catch (loadError) {
      console.error('Error loading policies:', loadError);
      setError(`Unable to load policies: ${loadError.message}`);
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

  const getCategoryIcon = (category) => {
    const icons = {
      'Loans': '💰',
      'Members': '👥',
      'Savings': '🏦',
      'Inventory': '📦',
      'Financial': '💵',
      'General': '📋'
    };
    return icons[category] || '📋';
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600">Manage cooperative policies and governance documents</p>
        </div>
        <button
          onClick={() => {
            setPolicyForm({ name: '', category: '', content: '', status: 'draft' });
            setEditingPolicyId(null);
            setShowCreateModal(true);
          }}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Policy</span>
        </button>
      </div>

      {/* Policy Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Policies</p>
              <p className="text-3xl font-bold text-gray-900">{policies.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Published</p>
              <p className="text-3xl font-bold text-green-600">
                {policies.filter(p => p.status === 'published').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Draft</p>
              <p className="text-3xl font-bold text-yellow-600">
                {policies.filter(p => p.status === 'draft').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Policies List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">Loading policies...</p>
        ) : policies.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">No policies have been created.</p>
        ) : policies.map((policy) => (
          <div key={policy.id} className="bg-white rounded-lg shadow border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-2xl">{getCategoryIcon(policy.category)}</span>
                  <h3 className="text-lg font-semibold text-gray-900">{policy.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(policy.status)}`}>
                    {policy.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{policy.content}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>Category: <span className="font-medium text-gray-700">{policy.category}</span></span>
                  <span>•</span>
                  <span>Last Updated: <span className="font-medium text-gray-700">{policy.lastUpdated}</span></span>
                  {policy.status === 'published' && (
                    <>
                      <span>•</span>
                      <span>Published: <span className="font-medium text-gray-700">{policy.publishedDate}</span></span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => handleViewPolicy(policy)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  View
                </button>
                <button
                  onClick={() => handleEditPolicy(policy)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                >
                  Edit
                </button>
                {policy.status === 'draft' && (
                  <button
                    onClick={() => handlePublishPolicy(policy.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    Publish
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Policy Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">{editingPolicyId ? 'Edit Policy' : 'Create New Policy'}</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Policy Name *
                </label>
                <input
                  type="text"
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  placeholder="e.g., Loan Collection Policy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  value={policyForm.category}
                  onChange={(e) => setPolicyForm({ ...policyForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Policy Content *
                </label>
                <textarea
                  value={policyForm.content}
                  onChange={(e) => setPolicyForm({ ...policyForm, content: e.target.value })}
                  placeholder="Enter the full policy content..."
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={policyForm.status}
                  onChange={(e) => setPolicyForm({ ...policyForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="draft">Draft (Save for later)</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
              <button
                onClick={handleCreatePolicy}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
              {saving ? 'Saving...' : policyForm.status === 'published' ? 'Save & Publish' : editingPolicyId ? 'Save Changes' : 'Save as Draft'}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingPolicyId(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Policy Modal */}
      {showViewModal && selectedPolicy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowViewModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getCategoryIcon(selectedPolicy.category)}</span>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedPolicy.name}</h3>
                    <p className="text-sm text-gray-500">{selectedPolicy.category}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Status</p>
                    <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedPolicy.status)}`}>
                      {selectedPolicy.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Last Updated</p>
                    <p className="text-base text-gray-900 mt-1">{selectedPolicy.lastUpdated}</p>
                  </div>
                  {selectedPolicy.status === 'published' && (
                    <>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Published By</p>
                        <p className="text-base text-gray-900 mt-1">{selectedPolicy.publishedBy || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Published Date</p>
                        <p className="text-base text-gray-900 mt-1">{selectedPolicy.publishedDate}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">Policy Content</h4>
                <div className="prose max-w-none">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedPolicy.content}</p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-200 flex space-x-3">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  handleEditPolicy(selectedPolicy);
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                Edit Policy
              </button>
              <button
                onClick={() => setShowViewModal(false)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
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
