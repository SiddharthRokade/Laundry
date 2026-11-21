import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Replace this empty schema with generated types when application tables exist.
type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

export function getSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL in apps/mobile/.env and restart Expo.');
  }
  if (!publishableKey) {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env and restart Expo.');
  }
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(url)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be an HTTPS project URL.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key.');
  }

  return { url: url.replace(/\/$/, ''), publishableKey };
}

let client: SupabaseClient<Database> | undefined;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createClient<Database>(url, publishableKey, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });
  }

  client = supabase;
  return supabase;
}
