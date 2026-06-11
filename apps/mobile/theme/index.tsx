import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  getThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../utils/preferences';
import { palettes, type Palette, type ThemeName } from './colors';
import { buildTypography, type Typography } from './typography';
import { spacing, radius } from './spacing';

export type { Palette, ThemeName } from './colors';
export { genderAccents } from './colors';
export { spacing, radius, MIN_TOUCH_TARGET } from './spacing';
export type { ThemePreference } from '../utils/preferences';

export interface Theme {
  name: ThemeName;
  colors: Palette;
  typography: Typography;
  spacing: typeof spacing;
  radius: typeof radius;
}

interface ThemeContextValue {
  theme: Theme;
  /** The raw stored preference ('system' resolves via the OS color scheme). */
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => Promise<void>;
}

function resolveThemeName(pref: ThemePreference, systemScheme: 'light' | 'dark'): ThemeName {
  if (pref === 'system') return systemScheme;
  return pref;
}

export function buildTheme(name: ThemeName): Theme {
  return {
    name,
    colors: palettes[name],
    typography: buildTypography(name),
    spacing,
    radius,
  };
}

const defaultTheme = buildTheme('light');

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  preference: 'system',
  setPreference: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    getThemePreference().then((pref) => {
      if (!cancelled) setPreferenceState(pref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (pref: ThemePreference) => {
    setPreferenceState(pref);
    await setThemePreference(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const name = resolveThemeName(preference, systemScheme);
    return { theme: buildTheme(name), preference, setPreference };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemePreference(): Pick<ThemeContextValue, 'preference' | 'setPreference'> {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
}

/**
 * Memoized themed StyleSheet factory. Keeps DESIGN.md's "no inline styles"
 * rule while letting styles react to theme switches:
 *
 *   const styles = useThemedStyles((t) => StyleSheet.create({
 *     container: { backgroundColor: t.colors.bg },
 *   }));
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
