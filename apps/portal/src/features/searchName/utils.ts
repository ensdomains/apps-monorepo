import { NameAvailabilityError } from './machines/searchNameMachine'

export const isNameAvailabilityError = (
  error: unknown,
): error is NameAvailabilityError => {
  return error instanceof NameAvailabilityError
}
export const getErrorMessage = (error: unknown) => {
  if (isNameAvailabilityError(error)) {
    return error.cause
  }
  return error
}
