import { fromAsyncThrowable } from 'neverthrow'
import { verifySiweMessage } from 'viem/siwe'
import { createIntoError } from '@/utils/result'

export const safeVerifySiweMessage = fromAsyncThrowable(
  verifySiweMessage,
  createIntoError('SIWE_VERIFY_ERROR'),
)
