import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function FitnessScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fitness</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.phase}>Phase 1 — coming next</Text>
      <Text style={styles.body}>
        Today&apos;s steps + calories will sync hourly from your phone&apos;s health store
        (HealthKit on iOS, Health Connect on Android) and show up here and on the web leaderboard.
      </Text>
      <Text style={styles.body}>
        All health-reading code lives in <Text style={styles.code}>packages/health-sync</Text> per
        the module-separation rule.
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
  code: {
    fontFamily: 'SpaceMono',
    fontSize: 13,
  },
  separator: {
    marginVertical: 18,
    height: 1,
    width: '80%',
  },
});
