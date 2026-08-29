import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type RealtimeRefreshTable = {
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
};

type RealtimeRefreshOptions = {
  channelName: string;
  tables: RealtimeRefreshTable[];
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  debounceMs?: number;
  client?: SupabaseClient;
};

export function useSupabaseRealtimeRefresh({
  channelName,
  tables,
  onRefresh,
  enabled = true,
  debounceMs = 250,
  client = supabase,
}: RealtimeRefreshOptions) {
  const refreshRef = React.useRef(onRefresh);

  React.useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  React.useEffect(() => {
    if (!enabled || tables.length === 0) return undefined;

    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void refreshRef.current();
      }, debounceMs);
    };

    const channel = tables.reduce((currentChannel, tableConfig) => (
      currentChannel.on('postgres_changes', {
        event: tableConfig.event ?? '*',
        schema: 'public',
        table: tableConfig.table,
        ...(tableConfig.filter ? { filter: tableConfig.filter } : {}),
      }, scheduleRefresh)
    ), client.channel(channelName));

    channel.subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [channelName, client, debounceMs, enabled, tables]);
}
