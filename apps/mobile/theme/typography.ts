import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';
import type { ThemeName } from './colors';

/**
 * Type scale per DESIGN.md §3. System fonts; the classic theme swaps headings
 * and body onto the platform serif (mirror of the web's Palatino swap).
 */

const serifFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export interface Typography {
  /** undefined = system default sans; classic theme returns the platform serif */
  fontFamily: string | undefined;
  screenTitle: TextStyle;
  sectionHeader: TextStyle;
  rowLabel: TextStyle;
  body: TextStyle;
  subtitle: TextStyle;
  cardTitle: TextStyle;
  cardDescription: TextStyle;
  button: TextStyle;
  input: TextStyle;
  helper: TextStyle;
  legal: TextStyle;
}

export function buildTypography(theme: ThemeName): Typography {
  const fontFamily = theme === 'classic' ? serifFamily : undefined;
  const base: TextStyle = fontFamily ? { fontFamily } : {};
  return {
    fontFamily,
    screenTitle: { ...base, fontSize: 28, fontWeight: '600' },
    sectionHeader: {
      // Section labels stay sans even on classic — uppercase serif reads poorly small.
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    rowLabel: { ...base, fontSize: 15, fontWeight: '500' },
    body: { ...base, fontSize: 15, fontWeight: '400', lineHeight: 21 },
    subtitle: { ...base, fontSize: 16, fontWeight: '400', lineHeight: 22 },
    cardTitle: { ...base, fontSize: 16, fontWeight: '600' },
    cardDescription: { ...base, fontSize: 14, fontWeight: '400', lineHeight: 20 },
    button: { fontSize: 16, fontWeight: '600' },
    input: { ...base, fontSize: 15, fontWeight: '400' },
    helper: { ...base, fontSize: 12, fontWeight: '400', lineHeight: 17 },
    legal: { ...base, fontSize: 11, fontWeight: '400', lineHeight: 16, opacity: 0.55 },
  };
}
