import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useMultipleRealtimeSubscriptions } from '../../hooks/useRealtimeSubscription';
import EmptyState from '../common/EmptyState';

const priorityStyles = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  normal: 'bg-blue-100 text-blue-800',
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
          icon={<span className="text-3xl">📢</span>}
          title="No Announcements"
          description="Announcements published by the cooperative will appear here."
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
          <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{a.content}</p>
        </article>
      ))}
    </div>
  );
};

export default MemberAnnouncements;
