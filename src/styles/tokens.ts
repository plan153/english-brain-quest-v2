/**
 * tokens.ts — 디자인 토큰. 다크 모드 기본, 라이트 토글.
 */
export interface ColorTokens {
  bg: string;
  surface: string;
  surfaceAlt: string;
  primary: string; // 성장/정답
  accent: string; // XP/강조
  danger: string; // 틀림
  text: string;
  textMuted: string;
  border: string;
}

export const darkTokens: ColorTokens = {
  bg: '#0F1419',
  surface: '#1A1F26',
  surfaceAlt: '#222831',
  primary: '#4ADE80',
  accent: '#FBBF24',
  danger: '#F87171',
  text: '#F3F4F6',
  textMuted: '#9CA3AF',
  border: '#2D333B',
};

export const lightTokens: ColorTokens = {
  bg: '#F6F3ED',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EDE5',
  primary: '#16A34A',
  accent: '#D97706',
  danger: '#DC2626',
  text: '#1A1F26',
  textMuted: '#6B7280',
  border: '#E5E7EB',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
};

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  pill: '999px',
};

export const fontSizes = {
  xs: '12px',
  sm: '14px',
  md: '16px',
  lg: '20px',
  xl: '24px',
  xxl: '32px',
};

export const TABS = ['today', 'brain', 'dictionary'] as const;
export type TabId = (typeof TABS)[number];
