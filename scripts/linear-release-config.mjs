const APP_DIRS = {
  manager: 'apps/manager',
  portal: 'apps/portal',
  'api-worker': 'workers/api-worker',
};
const SHARED_PATHS = ['packages/**', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'patches/**'];

export const getLinearReleaseConfig = ({ app, tag, previous }) => {
  const appDir = Object.hasOwn(APP_DIRS, app) ? APP_DIRS[app] : null;
  const pattern = new RegExp(`^${app}-[0-9]{4}-[0-9]{2}-[0-9]{2}(\\.([2-9]|[1-9][0-9]+))?$`);
  if (!appDir || !pattern.test(tag) || (previous !== null && !pattern.test(previous))) {
    return { error: 'Release tags must belong to the selected app and use its production date-tag format.' };
  }
  return { includePaths: [`${appDir}/**`, ...SHARED_PATHS].join(','), previous };
};
