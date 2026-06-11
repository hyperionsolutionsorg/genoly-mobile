import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles, type Theme } from '../theme';

export default function NotFoundScreen() {
  const styles = useThemedStyles(createStyles);
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          This screen doesn&apos;t exist.
        </Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    title: {
      ...t.typography.cardTitle,
      fontSize: 20,
      color: t.colors.text,
    },
    link: {
      marginTop: t.spacing.lg,
      paddingVertical: t.spacing.lg,
    },
    linkText: {
      fontSize: 14,
      color: t.colors.link,
    },
  });
}
