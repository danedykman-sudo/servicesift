export const FEATURES = {
  // Core features - always enabled
  ENABLE_BASIC_ANALYSIS: true,
  ENABLE_PAYMENTS: true,
  
  // Complex features - disabled for MVP
  ENABLE_DELTA_ANALYSIS: false,      // 3-lens comparison tracking
  ENABLE_PDF_GENERATION: false,      // PDF artifact creation
  ENABLE_EMAIL_SHARING: false,       // Send report via email
  ENABLE_FREE_MODE: true,           // Free analysis without payment
  ENABLE_MANUAL_TRIGGERS: false,     // Manual "Run Analysis Now" buttons
  ENABLE_ARTIFACT_DOWNLOADS: false,  // Download artifacts beyond basic JSON
} as const;

export type FeatureFlags = typeof FEATURES;

export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return FEATURES[feature];
}

