import type { FeatureFlags, ExportFormat } from '@itsjust/core';

export const toolConfig = {
  id: 'http-cookie-flag-auditor',
  name: 'HTTP Cookie Flag Auditor',
  category: 'Developer',
  description:
    'Audit Set-Cookie headers client-side for missing Secure, HttpOnly, SameSite and other cookie attribute mistakes with severity levels and fix recommendations.',
  version: '1.0.0',
  exportFormats: ['png', 'jpeg', 'webp', 'pdf', 'json'] as ExportFormat[],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  } as FeatureFlags,
  theme: {
    accent: '#f59e0b',
    accentHover: '#d97706',
    accentSubtle: 'rgba(245, 158, 11, 0.12)',
    brand: 'HTTP Cookie Flag Auditor',
    icon: '🍪',
  },
};

export default toolConfig;
