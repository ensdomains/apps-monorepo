import { checkNameAvailabilityService as realCheckService } from '@/features/register/services/checkNameAvailabilityService'

export interface NameAvailabilityResult {
  name: string
  isAvailable: boolean
  error?: string
}

export async function checkNameAvailability(
  name: string,
): Promise<NameAvailabilityResult> {
  console.log('🌐 Global service: checking name availability for:', name)

  try {
    // Use the real contract service
    const result = await realCheckService(name)

    if (result.isOk()) {
      const data = result.value
      console.log('✅ Global service: success', data)
      return {
        name: data.name,
        isAvailable: data.isAvailable,
      }
    } else {
      const error = result.error
      console.error('❌ Global service: contract error', error)
      return {
        name,
        isAvailable: false,
        error: `Contract error: ${error.cause}`,
      }
    }
  } catch (error) {
    console.error('❌ Global service: unexpected error', error)
    return {
      name,
      isAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
