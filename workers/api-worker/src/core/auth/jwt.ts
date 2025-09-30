import { sign, verify } from 'hono/jwt'
import { fromAsyncThrowable, ok } from 'neverthrow'
import * as v from 'valibot'
import { createIntoError, error } from '#utils/result.js'

const JWT_EXPIRATION = 60 * 60 * 3 // 3 hours

export const AuthPayload = v.object({
  user_id: v.string(),
  address: v.string(),
})

export type AuthPayload = v.InferOutput<typeof AuthPayload>

export const safeSign = fromAsyncThrowable(
  sign,
  createIntoError('SIGN_JWT_ERROR'),
)

export const safeVerify = fromAsyncThrowable(
  verify,
  createIntoError('VERIFY_JWT_ERROR'),
)

export const signJWT = (
  payload: Record<string, unknown>,
  env: CloudflareBindings,
  validFor: number = JWT_EXPIRATION,
) => {
  return safeSign(
    {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + validFor,
    },
    env.JWT_SECRET,
  )
}

export const verifyJWT = <TSchema extends v.ObjectSchema<any, any>>(
  token: string,
  env: CloudflareBindings,
  schema: TSchema,
) => {
  return safeVerify(token, env.JWT_SECRET).andThen((payload) => {
    const result = v.safeParse(schema, payload)
    if (!result.success) {
      return error({
        code: 'INVALID_JWT_PAYLOAD',
        message: 'Invalid JWT Payload',
        issues: result.issues,
      })
    }
    return ok(result.output)
  })
}
