import { TaggedError } from '@ens-apps/utils/neverthrow'
import { fromAsyncThrowable } from 'neverthrow'
import { verifySiweMessage } from 'viem/siwe'

class SiweVerifyError extends TaggedError('SIWE_VERIFY_ERROR')<{
  message: string
  cause?: unknown
}> {}

export const safeVerifySiweMessage = fromAsyncThrowable(
  verifySiweMessage,
  (err) =>
    new SiweVerifyError({
      message: err instanceof Error ? err.message : 'SIWE verification failed',
      cause: err,
    }),
)
