import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.phase}>Phase 1 — coming next</Text>
      <Text style={styles.body}>
        Login, primary device, sync status, sign out. The mobile app is free and payment-neutral —
        manage your subscription on the website at genoly.org.
      </Text>
      <Text style={styles.legal}>
        Genoly is a product of Hyperion Solutions LLC, an Illinois limited liability company.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  phase: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  legal: {
    fontSize: 11,
    opacity: 0.55,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  separator: {
    marginVertical: 18,
    height: 1,
    width: '80%',
  },
});
