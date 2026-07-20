# Feature Flags Guide

## Overview

Control features via environment variables or user-specific lists. User identifiers (wallet address, email, phone) are automatically detected.

## Setup

### Environment Variables

```bash
# .env
VITE_FF_DISCOUNTS_APPLIED=false
VITE_FF_LANGUAGE_SELECTOR=false
```

### Define Flags

In `utils/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  // Simple boolean (from env var)
  DISCOUNTS_APPLIED: {
    enabled: import.meta.env.VITE_FF_DISCOUNTS_APPLIED === 'true',
  },
  
  // Enabled only for specific users
  EXPERIMENTAL_FEATURE: {
    enabled: true,
    allowedUsers: BASE_USER_LISTS.PARA_TEST,
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
const enabled = useFeatureFlag('DISCOUNTS_APPLIED')
```

### Component

```typescript
<FeatureEnabled flag="NOTIFICATIONS_ENABLED">
  <NotificationsPanel />
</FeatureEnabled>
```

## Flag Logic

1. Check `deniedUsers` → if user matches, return `false`
2. Check `allowedUsers` → if user matches, return `true`
3. Otherwise → return `enabled` (base state)

## Base User Lists

```typescript
PARA_TEST_ACCOUNTS.EMAILS  // Para test emails
PARA_TEST_ACCOUNTS.PHONES  // Para test phones
BASE_USER_LISTS.TEAM       // Team members
BASE_USER_LISTS.QA         // QA testers
BASE_USER_LISTS.PARA_TEST  // All Para test accounts
```

User identifiers (wallet address, email, phone) are automatically detected from connected account.
