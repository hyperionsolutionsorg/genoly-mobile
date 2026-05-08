import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function FamilyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Family Tree</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.phase}>Phase 2 — coming later</Text>
      <Text style={styles.body}>
        This screen will host the Genoly family tree on mobile: pedigree view, person profiles, the
        Family Atlas, and Family Circles chat.
      </Text>
      <Text style={styles.body}>
        For now, manage your tree on the web at genoly.org.
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
