import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import { getDataLoadErrorMessage } from '../../lib/errorHandler';
import RichTextContent from './RichTextContent';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const PublishedPolicies = () => {
  const { staff } = useAuth();
  const audience = staff?.role === 'member' ? 'member' : 'staff';
  const [policies, setPolicies] = useState([]);
  const [expandedPolicyId, setExpandedPolicyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPolicies = useCallback(async () => {
    try {
      const { data, error: loadError } = await supabase
        .from('policies')
        .select('id, name, category, content, target_audience, published_at, published_by')
        .eq('status', 'published')
        .in('target_audience', [audience, 'both'])
        .order('published_at', { ascending: false });
      if (loadError) throw loadError;
      setPolicies(data || []);
      setError('');
    } catch (loadError) {
      console.error('Unable to load published policies:', loadError);
      setError(getDataLoadErrorMessage(loadError, 'published policies'));
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  useMultipleRealtimeSubscriptions(
    [{ table: 'policies', onUpdate: loadPolicies }],
    [loadPolicies]
  );

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-950">{audience === 'member' ? 'Member Policies' : 'Staff Policies'}</h1>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{error}</p>
          <button type="button" onClick={loadPolicies} className="mt-2 font-semibold underline underline-offset-2">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading policies…</p>
      ) : error ? null : policies.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-12 text-center">
          <FileText aria-hidden="true" className="mx-auto size-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">No published policies</p>
        </div>
      ) : (
        <section aria-label="Published policies" className="space-y-3">
          {policies.map((policy) => {
            const expanded = expandedPolicyId === policy.id;
            return (
              <article key={policy.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedPolicyId(expanded ? null : policy.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-gray-50 sm:p-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-gray-900">{policy.name}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>{policy.category}</span>
                      <span>Published {formatDate(policy.published_at)}</span>
                      {policy.published_by && <span>By {policy.published_by}</span>}
                    </span>
                  </span>
                  {expanded
                    ? <ChevronUp aria-hidden="true" className="size-5 shrink-0 text-gray-500" />
                    : <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-gray-500" />}
                </button>
                {expanded && (
                  <div className="border-t border-gray-100 px-4 py-5 sm:px-5">
                    <RichTextContent content={policy.content} className="break-words text-sm leading-6 text-gray-700" />
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default PublishedPolicies;
