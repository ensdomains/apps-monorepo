# Feature Flags Guide

## Overview

Control features via environment variables or user-specific lists. User identifiers (wallet address, email, phone) are automatically detected.

The language selector and migration-related rollout flags use **PostHog** instead — see `src/lib/posthog/feature-flags.ts`.

## Setup

### Environment Variables

```bash
# .env
VITE_FF_TEMP_PREMIUM_NAME_STATS=false
VITE_FF_USE_EOA=false
```

### Define Flags

In `utils/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  // Simple boolean (from env var)
  TEMP_PREMIUM_NAME_STATS: {
    enabled: import.meta.env.VITE_FF_TEMP_PREMIUM_NAME_STATS === 'true',
  },
  
  // Enabled only for specific users
  EXPERIMENTAL_FEATURE: {
    enabled: true,
    allowedUsers: BASE_USER_LISTS.TEAM,
  },
  
  // Disabled but team can still see it
  BETA_FEATURE: {
    enabled: false,
    allowedUsers: BASE_USER_LISTS.TEAM,
  },
  
  // Enabled for everyone except specific users
  NEW_UI: {
    enabled: true,
    deniedUsers: ['olduser@example.com'],
  },
} as const
```

## Usage

### Hook

```typescript
const enabled = useFeatureFlag('TEMP_PREMIUM_NAME_STATS')
```

### Component

```typescript
<FeatureEnabled flag="TEMP_PREMIUM_NAME_STATS">
  <PremiumNameStats />
</FeatureEnabled>
```

## Flag Logic

1. Check `deniedUsers` → if user matches, return `false`
2. Check `allowedUsers` → if user matches, return `true`
3. Otherwise → return `enabled` (base state)

## Base User Lists

```typescript
BASE_USER_LISTS.TEAM  // Team members
BASE_USER_LISTS.QA    // QA testers
BASE_USER_LISTS.BETA  // Beta users
```

User identifiers (wallet address, email, phone) are automatically detected from connected account.
