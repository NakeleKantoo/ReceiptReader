import { useColorScheme } from 'react-native';

export type Palette = {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
};

export const light: Palette = {
  bg: '#F5F7F6',
  card: '#FFFFFF',
  cardAlt: '#ECF1EF',
  text: '#12221F',
  textMuted: '#5B6B68',
  border: '#DCE4E2',
  primary: '#0F4C4C',
  primaryText: '#FFFFFF',
  danger: '#B3261E',
  success: '#2E7D32',
  warning: '#9A5B00',
};

export const dark: Palette = {
  bg: '#0C1413',
  card: '#141F1D',
  cardAlt: '#1C2A28',
  text: '#E9F0EE',
  textMuted: '#95A6A2',
  border: '#263634',
  primary: '#49C2B2',
  primaryText: '#04211D',
  danger: '#F2B8B5',
  success: '#7ED488',
  warning: '#F0B860',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
