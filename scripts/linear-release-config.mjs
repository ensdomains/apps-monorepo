export const APP_DIRS = {
  portal: 'apps/portal',
  manager: 'apps/manager',
  'api-worker': 'workers/api-worker',
};
// Keep the staging filters in .github/workflows/linear-releases.yml in sync.
const SHARED_GLOBS = ['packages/**', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'patches/**'];
export const SHARED_PATHS = SHARED_GLOBS.map(path => path.replace(/\/\*\*$/, ''));
export const RELEASE_TAG = new RegExp(
  `^(${Object.keys(APP_DIRS).join('|')})-(\\d{4}-\\d{2}-\\d{2})(?:\\.([2-9]|[1-9]\\d+))?$`,
);

export const getLinearReleaseConfig = ({ app, tag, previous }) => {
  const tagApp = RELEASE_TAG.exec(tag)?.[1];
  const previousApp = RELEASE_TAG.exec(previous)?.[1];
  if (!tagApp || tagApp !== app || (previous !== null && previousApp !== tagApp)) {
    return { error: 'Release tags must belong to the selected app and use its production date-tag format.' };
  }
  return { includePaths: [`${APP_DIRS[tagApp]}/**`, ...SHARED_GLOBS].join(','), previous };
};
