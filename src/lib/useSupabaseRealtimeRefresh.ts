import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type RealtimeRefreshTable = {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
};

export type RealtimeConnectionState = 'connecting' | 'live' | 'offline';

type RealtimeRefreshOptions = {
  channelName: string;
  tables: RealtimeRefreshTable[];
  onRefresh: () => void | Promise<void>;
  onConnectionStateChange?: (state: RealtimeConnectionState) => void;
  enabled?: boolean;
  debounceMs?: number;
  client?: SupabaseClient;
  refreshOnFocus?: boolean;
  pollMs?: number;
};

export function useSupabaseRealtimeRefresh({
  channelName,
  tables,
  onRefresh,
  onConnectionStateChange,
  enabled = true,
  debounceMs = 250,
  client = supabase,
  refreshOnFocus = false,
  pollMs = 0,
}: RealtimeRefreshOptions) {
  const refreshRef = React.useRef(onRefresh);
  const connectionStateRef = React.useRef(onConnectionStateChange);
  const refreshTimer = React.useRef<number | undefined>(undefined);
  const hasSubscribed = React.useRef(false);

  React.useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  React.useEffect(() => {
    connectionStateRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void refreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  React.useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
  }, []);

  React.useEffect(() => {
    if (!enabled || tables.length === 0) return undefined;

    connectionStateRef.current?.('connecting');

    const channel = tables.reduce((currentChannel, tableConfig) => (
      currentChannel.on('postgres_changes', {
        event: tableConfig.event ?? '*',
        schema: 'public',
        table: tableConfig.table,
        ...(tableConfig.filter ? { filter: tableConfig.filter } : {}),
      }, scheduleRefresh)
    ), client.channel(channelName));

    channel.subscribe((status, error) => {
      const state = String(status);
      if (state === 'SUBSCRIBED') {
        // Reconnects can drop changes made while the socket was down.
        if (hasSubscribed.current) scheduleRefresh();
        hasSubscribed.current = true;
        connectionStateRef.current?.('live');
        return;
      }
      if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        connectionStateRef.current?.('offline');
        console.warn(`[realtime] ${channelName} subscription ${state}`, error);
      }
    });

    return () => {
      void client.removeChannel(channel);
    };
  }, [channelName, client, enabled, scheduleRefresh, tables]);

  React.useEffect(() => {
    if (!enabled || (!refreshOnFocus && !pollMs)) return undefined;

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    if (refreshOnFocus) {
      document.addEventListener('visibilitychange', refreshWhenVisible);
      window.addEventListener('focus', refreshWhenVisible);
    }
    const pollTimer = pollMs ? window.setInterval(refreshWhenVisible, pollMs) : undefined;

    return () => {
      if (refreshOnFocus) {
        document.removeEventListener('visibilitychange', refreshWhenVisible);
        window.removeEventListener('focus', refreshWhenVisible);
      }
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [enabled, pollMs, refreshOnFocus, scheduleRefresh]);
}
