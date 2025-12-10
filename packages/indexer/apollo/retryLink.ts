import { RetryLink } from '@apollo/client/link/retry'

const retryLink = new RetryLink({
  attempts: { max: 3, retryIf: (error) => Boolean(error) },
  delay: { initial: 200, jitter: true, max: Number.POSITIVE_INFINITY },
})

export default retryLink
