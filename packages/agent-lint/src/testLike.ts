/**
 * Test-like files: tests, specs, e2e code, test utilities, fixtures, mocks
 * and stories. Rules that only make tests harder to write are off there; the
 * Biome config repeats this list (test/config.test.ts keeps them equal).
 */
export const TEST_LIKE_GLOBS: ReadonlyArray<string> = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/e2e/**',
  '**/test-utils/**',
  '**/__tests__/**',
  '**/_fixtures/**',
  '**/*.mock.ts',
  '**/*.mock.tsx',
  '**/*.stories.tsx',
  '**/.storybook/**',
]

const TEST_LIKE_PATH =
  /(?:^|\/)(?:e2e|test-utils|__tests__|_fixtures|\.storybook)\/|\.(?:test|spec)\.[^/]+$|\.mock\.tsx?$|\.stories\.tsx$/u

export const isTestLike = (path: string): boolean => TEST_LIKE_PATH.test(path)
