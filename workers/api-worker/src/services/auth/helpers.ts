import { fromAsyncThrowable } from 'neverthrow'
import { verifySiweMessage } from 'viem/siwe'
import { createIntoError } from '#utils/result.js'

export const safeVerifySiweMessage = fromAsyncThrowable(
  verifySiweMessage,
  createIntoError('SIWE_VERIFY_ERROR'),
)
