// @vitest-environment happy-dom
import { scopeTransactionId } from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openModal: vi.fn(),
  clear: vi.fn(),
}))

vi.mock('./useTransactionModal', () => ({
  useTransactionModal: () => ({
    isOpen: false,
    openModal: mocks.openModal,
    closeModal: vi.fn(),
    clearTransaction: mocks.clear,
  }),
}))

import { useFlowAttempt } from './useFlowAttempt'

const SIGNER = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
const OTHER = '0x1111111111111111111111111111111111111111'
const BASE_ID = 'tx-grant-roles'

beforeEach(() => {
  mocks.openModal.mockClear()
  mocks.clear.mockClear()
})

describe('useFlowAttempt', () => {
  it('is idle until started, so steps render under their bare id', () => {
    const { result } = renderHook(() => useFlowAttempt())

    expect(result.current.scope).toBeNull()
    expect(scopeTransactionId(BASE_ID, result.current.scope)).toBe(BASE_ID)
  })

  it('names the attempt for the signer and opens the modal in one call', () => {
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))

    expect(result.current.scope?.account).toBe(SIGNER.toLowerCase())
    expect(mocks.openModal).toHaveBeenCalledTimes(1)
    // The id a flow builds from the scope is what the manager keys on.
    expect(scopeTransactionId(BASE_ID, result.current.scope)).toMatch(
      new RegExp(`^${BASE_ID}--${SIGNER.toLowerCase()}-[0-9a-f]+$`),
    )
  })

  it('gives a second attempt by the same signer a different id', () => {
    // The WEB-1418 contract: the id attempt 1 left a finished actor under must
    // not be the id attempt 2 looks up.
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))
    const first = scopeTransactionId(BASE_ID, result.current.scope)
    act(() => result.current.end())
    act(() => result.current.start(SIGNER))
    const second = scopeTransactionId(BASE_ID, result.current.scope)

    expect(second).not.toBe(first)
    expect(second.startsWith(`${BASE_ID}--`)).toBe(true)
  })

  it('re-scopes when started again without ending, e.g. a re-submit', () => {
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))
    const first = result.current.scope
    act(() => result.current.start(SIGNER))

    expect(result.current.scope).not.toBe(first)
    expect(result.current.scope?.nonce).not.toBe(first?.nonce)
  })

  it('scopes to whichever wallet starts the attempt', () => {
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))
    const mine = scopeTransactionId(BASE_ID, result.current.scope)
    act(() => result.current.start(OTHER))
    const theirs = scopeTransactionId(BASE_ID, result.current.scope)

    expect(mine).toContain(SIGNER.toLowerCase())
    expect(theirs).toContain(OTHER)
    expect(theirs).not.toContain(SIGNER.toLowerCase())
  })

  it('returns to idle on end', () => {
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))
    act(() => result.current.end())

    expect(result.current.scope).toBeNull()
  })

  it('never clears the transaction manager', () => {
    // `clear()` stops every actor in the app, including another flow's
    // in-flight transaction; the scope alone is what prevents a stale match.
    const { result } = renderHook(() => useFlowAttempt())

    act(() => result.current.start(SIGNER))
    act(() => result.current.end())

    expect(mocks.clear).not.toHaveBeenCalled()
  })

  it('keeps start and end stable across renders', () => {
    // Callers list them in effect dependencies (RolesAddUserSheet resets on
    // `attempt.end`), so a fresh closure per render would re-run those.
    const { result, rerender } = renderHook(() => useFlowAttempt())
    const { start, end } = result.current

    act(() => result.current.start(SIGNER))
    rerender()

    expect(result.current.start).toBe(start)
    expect(result.current.end).toBe(end)
  })
})
