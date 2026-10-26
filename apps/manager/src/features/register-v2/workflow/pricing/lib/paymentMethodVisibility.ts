const DEFAULT_VISIBLE_METHODS = 3

export type PaymentMethodVisibilityResult<TMethod> = {
  readonly visibleMethods: readonly TMethod[]
  readonly hiddenCount: number
}

/** The first few methods, plus the selected one when it sits further down. */
export const getPaymentMethodVisibility = <
  TMethod extends { readonly isSelected: boolean },
>(
  methods: readonly TMethod[],
  isExpanded: boolean,
): PaymentMethodVisibilityResult<TMethod> => {
  if (isExpanded) return { visibleMethods: methods, hiddenCount: 0 }
  const visibleMethods = methods.filter(
    (method, index) => index < DEFAULT_VISIBLE_METHODS || method.isSelected,
  )
  return {
    visibleMethods,
    hiddenCount: methods.length - visibleMethods.length,
  }
}
