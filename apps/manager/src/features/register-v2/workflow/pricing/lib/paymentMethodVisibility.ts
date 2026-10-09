export type PaymentMethodVisibilityStatus = {
  readonly isAvailable: boolean
  readonly isFunded: boolean
  readonly isCommon: boolean
}

export type PaymentMethodVisibilityResult<TMethod> = {
  readonly visibleMethods: readonly TMethod[]
  readonly hiddenCount: number
}

/**
 * Selects which supplied presentation models are visible in the payment rail.
 * It deliberately knows nothing about tokens, accounts, or queries.
 */
export const getPaymentMethodVisibility = <
  TMethod extends PaymentMethodVisibilityStatus,
>(
  methods: readonly TMethod[],
  isExpanded: boolean,
): PaymentMethodVisibilityResult<TMethod> => {
  if (isExpanded) {
    return { visibleMethods: methods, hiddenCount: 0 }
  }

  const validMethods = methods.filter(
    (method) => method.isAvailable && method.isFunded,
  )
  const visibleMethods =
    validMethods.length > 0
      ? validMethods
      : methods.filter((method) => method.isCommon)

  return {
    visibleMethods,
    hiddenCount: methods.length - visibleMethods.length,
  }
}
