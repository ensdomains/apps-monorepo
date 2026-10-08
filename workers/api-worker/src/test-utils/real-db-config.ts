export const LOCAL_TEST_DATABASE_NAME = 'api_worker_test'
export const LOCAL_TEST_DATABASE_URL = `postgres://postgres:postgres@db.localtest.me:5432/${LOCAL_TEST_DATABASE_NAME}`

// Deliberately narrow: no alternate hosts, databases, credentials or connection
// options that could redirect setup/cleanup. Never use DATABASE_URL/.dev.vars.
export const requireLocalTestDatabase = (
  flag: string | undefined,
  value: string,
): string => {
  if (flag !== '1')
    throw new Error('Real database tests require RUN_REAL_DB_TESTS=1')
  const url = new URL(value)
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== 'db.localtest.me' ||
    url.port !== '5432' ||
    url.pathname !== `/${LOCAL_TEST_DATABASE_NAME}` ||
    url.username !== 'postgres' ||
    url.password !== 'postgres' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error(
      `Refusing unsafe real-test database URL; use the dedicated local ${LOCAL_TEST_DATABASE_NAME} database`,
    )
  return value
}
