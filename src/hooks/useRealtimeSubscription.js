import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Custom hook for Supabase real-time subscriptions
 * @param {string} table - The table name to subscribe to
 * @param {function} onUpdate - Callback function when data changes
 * @param {object} filter - Optional filter object { column: value }
 * @param {array} dependencies - Dependencies array for useEffect
 */
export const useRealtimeSubscription = (table, onUpdate, filter = null, dependencies = [], enabled = true) => {
  useEffect(() => {
    if (!enabled) return undefined;

    // Create a unique channel name
    const channelName = `${table}_${Date.now()}_${Math.random()}`;
    
    // Set up the subscription
    let subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events: INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          ...(filter && { filter: `${filter.column}=eq.${filter.value}` })
        },
        (payload) => {
          onUpdate?.(payload);
        }
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Realtime subscription for ${table} failed (${status})`, error);
        }
      });

    // Cleanup function
    return () => {
      console.log(`Unsubscribing from ${table}`);
      supabase.removeChannel(subscription);
    };
  }, [...dependencies, enabled]);
};

/**
 * Custom hook for multiple table subscriptions
 * @param {array} subscriptions - Array of subscription configs [{ table, onUpdate, filter }]
 * @param {array} dependencies - Dependencies array for useEffect
 */
export const useMultipleRealtimeSubscriptions = (subscriptions, dependencies = []) => {
  useEffect(() => {
    const channels = subscriptions.map((sub, index) => {
      const channelName = `${sub.table}_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`;
      
      return supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: sub.table,
            ...(sub.filter && { filter: `${sub.filter.column}=eq.${sub.filter.value}` })
          },
          (payload) => sub.onUpdate?.(payload)
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Realtime subscription for ${sub.table} failed (${status})`, error);
          }
        });
    });

    // Cleanup function
    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, dependencies);
};
