import { assert, describe, expect, it } from 'vitest'
import { DataError, TaggedError, YieldableError } from '../error-classes'

describe('YieldableError', () => {
  it('should create an error with message', () => {
    const error = new YieldableError('Test error')
    expect(error.message).toBe('Test error')
    expect(error.name).toBe('Error')
  })

  it('should be yieldable in generator functions', () => {
    const error = new YieldableError('Test error')
    const iterator = error[Symbol.iterator]()

    const result = iterator.next()
    expect(result.done).toBe(false)
    assert(result.value.isErr())
    expect(result.value.error).toBe(error)

    const finalResult = iterator.next()
    expect(finalResult.done).toBe(true)
    expect(finalResult.value.isErr()).toBe(true)
  })
})

describe('DataError', () => {
  it('should create error with data', () => {
    const error = new DataError({
      message: 'Validation failed',
      field: 'email',
      value: 'invalid-email',
    })

    expect(error.message).toBe('Validation failed')
    expect(error.field).toBe('email')
    expect(error.value).toBe('invalid-email')
  })

  it('should create error without data', () => {
    const error = new DataError({})
    expect(error.message).toBe('')
  })

  it('should serialize to JSON with all data', () => {
    const error = new DataError({
      message: 'Test error',
      code: 'TEST_ERROR',
      details: { field: 'email' },
    })

    const serialized = error.toJSON()
    expect(serialized).toEqual({
      code: 'TEST_ERROR',
      details: { field: 'email' },
    })
  })

  it('should have proper toString representation', () => {
    const error = new DataError({
      message: 'Test error',
    })
    error.name = 'TestError'

    expect(error.toString()).toBe('TestError: Test error')
  })

  it('should have proper toString without message', () => {
    const error = new DataError({})
    error.name = 'TestError'

    expect(error.toString()).toBe('TestError')
  })
})

describe('TaggedError', () => {
  it('should create tagged error class', () => {
    const ValidationError = TaggedError('VALIDATION_ERROR')<{
      field: string
      message: string
    }>
    const error = new ValidationError({
      message: 'Invalid input',
      field: 'email',
    })

    expect(error._tag).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('Invalid input')
    expect(error.field).toBe('email')
  })

  it('should create tagged error without data', () => {
    const NetworkError = TaggedError('NETWORK_ERROR')<{
      foo: string
    }>
    const error = new NetworkError({
      message: 'Test error',
      foo: 'bar',
    })

    expect(error._tag).toBe('NETWORK_ERROR')
  })

  it('should have proper name property', () => {
    const DatabaseError = TaggedError('DATABASE_ERROR')<{
      message: string
    }>
    const error = new DatabaseError({ message: 'Connection failed' })

    expect(error.name).toBe('DATABASE_ERROR')
  })

  it('should work with pattern matching', () => {
    const ValidationError = TaggedError('VALIDATION_ERROR')<{
      message: string
    }>
    const NetworkError = TaggedError('NETWORK_ERROR')<{
      message: string
    }>

    const validationError = new ValidationError({ message: 'Invalid' })
    const networkError = new NetworkError({ message: 'Timeout' })

    expect(validationError._tag).toBe('VALIDATION_ERROR')
    expect(networkError._tag).toBe('NETWORK_ERROR')
  })
})
