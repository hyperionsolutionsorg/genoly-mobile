import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.phase}>Phase 2 — coming later</Text>
      <Text style={styles.body}>
        Birthday and anniversary reminders, Family Circles activity, fitness goal milestones,
        and friend invites will land here. All preference-gated per Genoly&apos;s notification
        rules.
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
  separator: {
    marginVertical: 18,
    height: 1,
    width: '80%',
  },
});
