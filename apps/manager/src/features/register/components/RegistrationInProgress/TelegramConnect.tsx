/**
 * TelegramConnect Component
 *
 * Handles Telegram authentication via Telegram Login Widget.
 * Supports both mock mode (for development) and production mode.
 *
 * Configuration:
 * - Set VITE_TELEGRAM_BOT_USERNAME in environment variables
 * - Bot username should be without @ symbol (e.g., "my_bot" not "@my_bot")
 * - Configure domain with /setdomain command in @BotFather
 * - Bot ID: 8430077778 (for reference - NOT used by widget, only username is needed)
 *
 * To get your bot username:
 * 1. Open Telegram and message @BotFather
 * 2. Send /mybots
 * 3. Select your bot
 * 4. The username is shown (e.g., "my_bot" without @)
 */
'use client'

import { MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  addTelegramChannel,
  type TelegramAuthData,
  USE_MOCK_API,
} from '@/features/register/services/notificationService'
import { cn } from '@/lib/utils'

// Telegram bot configuration
// Bot username: ens_managerv4_bot
// Bot ID: 8430077778
// Bot token should be stored server-side for hash verification (not in client)
const TELEGRAM_BOT_USERNAME =
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ens_managerv4_bot'

// Extend Window interface for Telegram auth callback
declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramAuthData) => void
  }
}

interface TelegramConnectProps {
  /** Whether Telegram is currently connected */
  connected: boolean
  /** Callback when connection status changes */
  onConnectionChange: (connected: boolean) => void
  /** Optional className for styling */
  className?: string
  /** Force real widget mode even if USE_MOCK_API is true (for testing) */
  forceRealWidget?: boolean
}

export const TelegramConnect = ({
  connected,
  onConnectionChange,
  className,
  forceRealWidget = false,
}: TelegramConnectProps) => {
  const [isConnecting, setIsConnecting] = useState(false)
  const telegramWidgetRef = useRef<HTMLDivElement>(null)
  const telegramScriptLoaded = useRef(false)

  // Determine if we should use real widget or mock
  const useRealWidget = forceRealWidget || !USE_MOCK_API

  // Setup Telegram widget and callback
  useEffect(() => {
    // Create global callback function for Telegram auth
    window.onTelegramAuth = async (user: TelegramAuthData) => {
      setIsConnecting(true)
      try {
        console.log('📱 Telegram auth received:', user)

        const result = await addTelegramChannel(user)

        if (result.connected) {
          onConnectionChange(true)
          console.log('✅ Telegram connected successfully')
        }
      } catch (error) {
        console.error('❌ Telegram signup failed:', error)
      } finally {
        setIsConnecting(false)
      }
    }

    return () => {
      // Cleanup: remove callback on unmount
      delete window.onTelegramAuth
    }
  }, [onConnectionChange])

  // Load Telegram widget script when ref is available
  useEffect(() => {
    if (!useRealWidget || connected) {
      console.log('🔍 Widget loading skipped:', { useRealWidget, connected })
      return
    }

    console.log('🔍 Attempting to load Telegram widget:', {
      botUsername: TELEGRAM_BOT_USERNAME,
      refAvailable: !!telegramWidgetRef.current,
      scriptLoaded: telegramScriptLoaded.current,
    })

    const loadWidget = () => {
      if (!telegramWidgetRef.current) {
        console.warn('⚠️ Telegram widget ref not available yet')
        return
      }

      if (telegramScriptLoaded.current) {
        console.log('✅ Telegram widget script already loaded')
        return
      }

      if (TELEGRAM_BOT_USERNAME === 'your_bot_username') {
        console.error(
          '❌ VITE_TELEGRAM_BOT_USERNAME is not set. Please configure your bot username in environment variables.',
        )
        return
      }

      // Clear any existing content
      telegramWidgetRef.current.innerHTML = ''

      const script = document.createElement('script')
      script.src = 'https://telegram.org/js/telegram-widget.js?22'
      script.async = true
      script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME)
      script.setAttribute('data-size', 'large')
      script.setAttribute('data-onauth', 'onTelegramAuth')
      script.setAttribute('data-request-access', 'write')
      script.setAttribute('data-radius', '20')

      script.onerror = (error) => {
        console.error('❌ Failed to load Telegram widget script:', error)
        telegramScriptLoaded.current = false
      }

      script.onload = () => {
        console.log('✅ Telegram widget script loaded successfully')
        // Check if widget iframe was created
        setTimeout(() => {
          const iframe = telegramWidgetRef.current?.querySelector('iframe')
          if (iframe) {
            console.log('✅ Telegram widget iframe created')
          } else {
            console.warn('⚠️ Telegram widget iframe not found after script load')
          }
        }, 500)
      }

      console.log('📤 Appending Telegram widget script to DOM')
      telegramWidgetRef.current.appendChild(script)
      telegramScriptLoaded.current = true
    }

    // Try to load immediately if ref is available
    if (telegramWidgetRef.current) {
      loadWidget()
    } else {
      // Also try after a short delay in case ref wasn't ready
      const timeoutId = setTimeout(loadWidget, 100)
      return () => {
        clearTimeout(timeoutId)
        if (telegramWidgetRef.current) {
          telegramWidgetRef.current.innerHTML = ''
        }
        telegramScriptLoaded.current = false
      }
    }

    return () => {
      if (telegramWidgetRef.current) {
        telegramWidgetRef.current.innerHTML = ''
      }
      telegramScriptLoaded.current = false
    }
  }, [connected, useRealWidget])

  const handleTelegramSignup = async () => {
    if (!useRealWidget) {
      // Mock implementation for development
      setIsConnecting(true)
      try {
        console.log('📱 [MOCK] Initiating Telegram signup...')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const mockAuthData: TelegramAuthData = {
          id: 123456789,
          first_name: 'John',
          last_name: 'Doe',
          username: 'johndoe',
          photo_url: 'https://via.placeholder.com/100',
          auth_date: Math.floor(Date.now() / 1000),
          hash: 'mock_hash_for_development',
        }

        const result = await addTelegramChannel(mockAuthData)

        if (result.connected) {
          onConnectionChange(true)
          console.log('✅ Telegram connected successfully (mocked)')
        }
      } catch (error) {
        console.error('❌ Telegram signup failed:', error)
      } finally {
        setIsConnecting(false)
      }
    } else {
      // In production, the widget will handle the auth via the callback
      // Just trigger the widget click if it exists
      const widget = telegramWidgetRef.current?.querySelector('iframe')
      if (widget) {
        widget.click()
      } else {
        console.warn(
          '⚠️ Telegram widget not loaded yet. Please wait for it to appear.',
        )
      }
    }
  }

  // Show error if bot username is not configured
  if (useRealWidget && TELEGRAM_BOT_USERNAME === 'your_bot_username') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex items-center gap-3.5 rounded-lg border border-yellow-500 bg-yellow-50 px-4 py-2.5">
          <MessageCircle className="h-5 w-5 text-yellow-700" />
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm text-yellow-800">
              Telegram Bot Not Configured
            </span>
            <span className="text-xs text-yellow-700">
              Please set VITE_TELEGRAM_BOT_USERNAME in your environment
              variables.
              <br />
              Bot ID: 8430077778 (for reference)
              <br />
              To get your bot username: Message @BotFather → /mybots → Select
              your bot
            </span>
          </div>
        </div>
        <p className="text-ens-gray text-sm leading-[19.6px]">
          Get instant updates through Telegram for your domains
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {connected ? (
        <div className="flex items-center gap-3.5 rounded-full bg-ens-peridot-core px-4 py-2.5">
          <MessageCircle className="h-5 w-5 text-white" />
          <span className="font-medium text-base text-white leading-[15.36px] tracking-tight">
            Telegram Connected ✓
          </span>
        </div>
      ) : !useRealWidget ? (
        <button
          type="button"
          onClick={handleTelegramSignup}
          disabled={isConnecting}
          className={cn(
            'flex w-fit items-center justify-center gap-3.5 rounded-full px-4 py-2.5 transition-colors',
            'bg-ens-lapis-core hover:bg-ens-lapis-core/90',
            isConnecting && 'cursor-wait opacity-50',
          )}
        >
          <MessageCircle className="h-5 w-5 text-white" />
          <span className="font-medium text-base text-white leading-[15.36px] tracking-tight">
            {isConnecting ? 'Connecting...' : 'Sign up with Telegram'}
          </span>
        </button>
      ) : (
        <div
          ref={telegramWidgetRef}
          className="flex min-h-[40px] w-fit items-center"
        >
          {isConnecting && (
            <span className="text-ens-gray text-sm">
              Loading Telegram widget...
            </span>
          )}
        </div>
      )}
      <p className="text-ens-gray text-sm leading-[19.6px]">
        Get instant updates through Telegram for your domains
      </p>
    </div>
  )
}
