import type { AiEvalCase } from './corpus'

// Authored before repair outcomes or new provider responses. These are fresh
// development contrasts, not reserved tests and not replacements for old labels.
const common = {
  entryPoint: 'ai',
  split: 'development',
  smoke: false,
} as const
const profile = (
  name: string,
  field: string,
  operation: 'feature' | 'unfeature' | 'remove',
) => ({
  status: 'ready' as const,
  action: {
    intent: 'edit_profile',
    name,
    section: 'contact',
    proposal: { field, operation, value: '' },
  },
})

export const SOCIAL_CONTRAST_CORPUS = [
  {
    ...common,
    id: 'social-contrast-twitter',
    query: 'Unstar the Twitter contact for heliotrope.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('heliotrope.eth', 'twitter', 'unfeature'),
  },
  {
    ...common,
    id: 'social-contrast-github',
    query: 'Pin the githb account on elderberry.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'typo',
    expected: profile('elderberry.eth', 'github', 'feature'),
  },
  {
    ...common,
    id: 'social-contrast-instagram',
    query: 'Remove the Instagram record from buttercup.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('buttercup.eth', 'instagram', 'remove'),
  },
  {
    ...common,
    id: 'social-contrast-discord',
    query: 'Feature the Discord contact on cress.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('cress.eth', 'discord', 'feature'),
  },
  {
    ...common,
    id: 'social-contrast-telegram',
    query: 'Unpin the Telegram account for wisteria.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('wisteria.eth', 'telegram', 'unfeature'),
  },
  {
    ...common,
    id: 'social-contrast-farcaster-missing-name',
    query: 'Feature the Farcaster contact',
    category: 'clarification',
    family: 'edit_profile',
    language: 'canonical',
    expected: { status: 'needs_input', field: 'name' },
  },
  {
    ...common,
    id: 'social-contrast-linkedin',
    query: 'Star the LinkedIn account on heliotrope.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'paraphrase',
    expected: profile('heliotrope.eth', 'linkedin', 'feature'),
  },
  {
    ...common,
    id: 'social-contrast-mastodon',
    query: 'Unfeature the Mastodon contact for elderberry.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('elderberry.eth', 'mastodon', 'unfeature'),
  },
  {
    ...common,
    id: 'social-contrast-reddit',
    query: 'Delete the Reddit record from cress.eth',
    category: 'supported',
    family: 'edit_profile',
    language: 'canonical',
    expected: profile('cress.eth', 'reddit', 'remove'),
  },
  {
    ...common,
    id: 'social-contrast-tiktok-negated',
    query: 'Do not feature the TikTok account on buttercup.eth',
    category: 'unsupported',
    family: 'safety',
    language: 'canonical',
    expected: { status: 'unsupported' },
  },
  {
    ...common,
    id: 'social-contrast-twitch-condition',
    query:
      'Unpin the Twitch contact for wisteria.eth only if it has over 100 followers',
    category: 'unsupported',
    family: 'safety',
    language: 'paraphrase',
    expected: { status: 'unsupported' },
  },
  {
    ...common,
    id: 'social-contrast-name-unfavorite',
    query: 'Unstar heliotrope.eth',
    category: 'supported',
    family: 'manager_action',
    language: 'canonical',
    expected: {
      status: 'ready',
      action: {
        intent: 'manager_action',
        kind: 'unfavorite',
        name: 'heliotrope.eth',
      },
    },
  },
] as const satisfies readonly AiEvalCase[]
