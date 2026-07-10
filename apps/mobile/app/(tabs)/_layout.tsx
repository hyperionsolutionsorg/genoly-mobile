import React from 'react';
import FontAwesome from '@react-native-vector-icons/fontawesome';
import { Tabs } from 'expo-router';

import { useTheme } from '../../theme';

// Browse FontAwesome 5 icon names at https://icons.expo.fyi/Index?q=fa5
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={26} style={{ marginBottom: -3 }} {...props} />;
}

/**
 * Member-app navigation (C1 rework):
 *   Home       — member dashboard (streaks, today's pick, anniversaries…)
 *   Tree       — family-tree exploration hub
 *   Challenges — family walking challenges
 *   Activity   — your steps/calories/distance (the former Fitness tab)
 *   Settings   — account, themes, privacy, health sources
 *
 * The old Notifications tab is gone — notification preferences live in
 * Settings; there is no feed surface in the member app (matches web).
 */
export default function TabLayout() {
  const t = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.bgElevated, borderTopColor: t.colors.border },
        headerStyle: { backgroundColor: t.colors.bgElevated },
        headerTintColor: t.colors.text,
        // No native tab headers: every tab screen renders its own in-page
        // title via <Screen>, so the bar was a duplicate (e.g. "Tree" twice
        // — operator report 2026-07-10).
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="tree"
        options={{
          title: 'Tree',
          tabBarIcon: ({ color }) => <TabBarIcon name="sitemap" color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarIcon: ({ color }) => <TabBarIcon name="trophy" color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => <TabBarIcon name="heartbeat" color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color as string} />,
        }}
      />
    </Tabs>
  );
}
