import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import EmptyState from '../common/EmptyState';
import RichTextContent from '../common/RichTextContent';

const priorityStyles = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-green-100 text-green-800',
  low: 'bg-gray-100 text-gray-700'
};

const MemberAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, priority, published_at, expires_at')
      .eq('is_active', true)
      .contains('target_roles', ['member'])
      .order('published_at', { ascending: false });

    if (error) console.error('Error fetching announcements:', error);
    const now = new Date();
    setAnnouncements((data || []).filter((a) => !a.expires_at || new Date(a.expires_at) > now));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  useMultipleRealtimeSubscriptions([
    { table: 'announcements', onUpdate: fetchAnnouncements }
  ], [fetchAnnouncements]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-gray-500">Loading announcements...</p>;
  }

  if (announcements.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={(
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          )}
          title="No Announcements"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <article key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-900">{a.title}</h3>
            {a.priority && a.priority !== 'normal' && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${priorityStyles[a.priority] || priorityStyles.normal}`}>{a.priority}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {new Date(a.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <RichTextContent content={a.content} className="mt-3 break-words text-sm text-gray-700" />
        </article>
      ))}
    </div>
  );
};

export default MemberAnnouncements;
