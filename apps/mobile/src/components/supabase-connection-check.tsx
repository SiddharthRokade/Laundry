import { useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getSupabaseConfig } from '@/lib/supabase';

export function SupabaseConnectionCheck() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('Check whether this device can reach Supabase Auth.');

  async function checkConnection() {
    let config: ReturnType<typeof getSupabaseConfig>;
    try {
      config = getSupabaseConfig();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read Supabase configuration.');
      return;
    }

    setChecking(true);
    setMessage('Checking Supabase Auth…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${config.url}/auth/v1/health`, {
        headers: { apikey: config.publishableKey },
        signal: controller.signal,
      });
      if (response.ok) {
        setMessage(`Supabase Auth is reachable (HTTP ${response.status}). Only Auth reachability was checked.`);
      } else if (response.status === 401 || response.status === 403) {
        setMessage(`Supabase Auth denied the request (HTTP ${response.status}). Check that the publishable key belongs to this project.`);
      } else {
        setMessage(`Supabase Auth check failed (HTTP ${response.status}). Check the project URL and project status.`);
      }
    } catch {
      setMessage(controller.signal.aborted
        ? 'Supabase Auth did not respond within 10 seconds. Check your internet connection and retry.'
        : 'Could not reach Supabase Auth. Check your internet connection and project URL, then retry.');
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }

  return (
    <View style={styles.container}>
      <ThemedText accessibilityRole="header" type="smallBold">Supabase Auth connection</ThemedText>
      <ThemedText accessibilityLiveRegion="polite" type="small">{message}</ThemedText>
      <Button title="Check connection" onPress={checkConnection} disabled={checking} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
});
