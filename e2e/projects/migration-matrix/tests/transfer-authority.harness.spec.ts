import { test, expect } from '@playwright/test'
import { legacyTransferAuthority } from '../transfer-authority.js'
import { zeroAddress } from 'viem'

test('parent reassignment is an independent V1 transfer route', () => {
  const result = legacyTransferAuthority({ transfer: { result: 'DENIED' }, transferAsParent: { result: 'ALLOWED' } })
  expect(result.result).toBe('ALLOWED')
  expect(result.allowedRoutes).toEqual(['parent'])
  expect(result.routes.holder.result).toBe('DENIED')
})

test('denial requires every applicable route to deny', () => {
  expect(legacyTransferAuthority({ transfer: { result: 'DENIED' } }).result).toBe('DENIED')
  expect(legacyTransferAuthority({ transfer: { result: 'DENIED' }, transferAsParent: { result: 'DENIED' } }).result).toBe('DENIED')
  expect(legacyTransferAuthority({ transfer: { result: 'DENIED' }, transferAsParent: { result: 'BLOCKED', detail: 'RPC unavailable' } }).result).toBe('BLOCKED')
})

test('one verified allowed route suffices without erasing the other probe', () => {
  const result = legacyTransferAuthority({ transfer: { result: 'ALLOWED' }, transferAsParent: { result: 'BLOCKED', detail: 'RPC unavailable' } })
  expect(result.result).toBe('ALLOWED')
  expect(result.allowedRoutes).toEqual(['holder'])
  expect(result.routes.parent?.result).toBe('BLOCKED')
})

test('a cleared wrapped holder needs re-issue, even when the parent can set a new owner', () => {
  const result = legacyTransferAuthority({ transfer: { result: 'DENIED' }, transferAsParent: { result: 'ALLOWED' } }, { wrappedSubnameHolder: zeroAddress })
  expect(result.result).toBe('DENIED')
  expect(result.allowedRoutes).toEqual([])
  expect(result.requiresReissue).toBe(true)
  expect(result.reissueAsParent?.result).toBe('ALLOWED')
  expect(result.routes.parent?.result).toBe('ALLOWED')
})

test('a nonzero wrapped holder keeps parent transfer authority distinct from re-issue', () => {
  const result = legacyTransferAuthority({ transfer: { result: 'DENIED' }, transferAsParent: { result: 'ALLOWED' } }, { wrappedSubnameHolder: '0x1111111111111111111111111111111111111111' })
  expect(result.result).toBe('ALLOWED')
  expect(result.allowedRoutes).toEqual(['parent'])
  expect(result.requiresReissue).toBe(false)
  expect(result.reissueAsParent).toBeUndefined()
})
