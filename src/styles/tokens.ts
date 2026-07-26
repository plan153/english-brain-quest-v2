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

/** 낮 모드 — 밝은 쿨 그레이 + 옅은 청색 */
export const lightTokens: ColorTokens = {
  bg: '#EEF2F6',
  surface: '#FFFFFF',
  surfaceAlt: '#E4EBF3',
  primary: '#0D9488',
  accent: '#0284C7',
  danger: '#DC2626',
  text: '#1E293B',
  textMuted: '#64748B',
  border: '#CDD7E3',
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
