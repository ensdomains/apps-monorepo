import {
  type AuthState,
  type AuthStateLogin,
  type AuthStateSignup,
  ParaWeb,
  type VerifiedAuth,
} from '@getpara/web-sdk'
import { assign, createActor, fromPromise, log, setup } from 'xstate'

export const para = new ParaWeb('beta_2996c2e68bb6304f19eb12b0288ffbff')

const openLinkInMiniWindow = (url?: string) => {
  if (!url) return
  const miniWindow = window.open(url, '_blank', 'width=500,height=600')
  if (miniWindow) {
    miniWindow.focus()
  }

  return () => miniWindow ?? undefined
}

const machine = setup({
  types: {
    context: {} as {
      authState?: AuthState
      email?: string
      phoneNumber?: `+${number}`
      verificationCode?: string
      popupWindow?: () => Window | undefined
    },
    events: {} as
      | {
          type: 'OPEN'
        }
      | {
          type: 'CLOSE'
        }
      | {
          type: 'LOGIN_EMAIL'
          email: string
        }
      | {
          type: 'LOGIN_PHONE'
          phoneNumber: `+${number}`
        }
      | {
          type: 'VERIFY_OTP'
          verificationCode: string
        },
  },
  actors: {
    signUpOrLogin: fromPromise(({ input }: { input: VerifiedAuth }) => {
      return para.signUpOrLogIn({ auth: input })
    }),
    verifyNewAccount: fromPromise(({ input }: { input: string }) => {
      return para.verifyNewAccount({ verificationCode: input })
    }),
    waitForWalletCreation: fromPromise(
      ({ input }: { input?: () => Window | undefined }) => {
        return para.waitForWalletCreation({
          isCanceled: () => input?.()?.closed ?? true,
        })
      },
    ),
    waitForLogin: fromPromise(
      ({ input }: { input?: () => Window | undefined }) => {
        return para.waitForLogin({
          isCanceled: () => input?.()?.closed ?? true,
        })
      },
    ),
  },
  actions: {
    openPopupWindow: assign((_, { url }: { url?: string }) => ({
      popupWindow: openLinkInMiniWindow(url),
    })),
  },
}).createMachine({
  initial: 'closed',
  states: {
    closed: {
      on: {
        OPEN: {
          actions: [log('Viva la vida loca')],
          target: 'input',
        },
      },
    },
    input: {
      on: {
        LOGIN_EMAIL: {
          actions: [
            assign({
              email: ({ event }) => event.email,
            }),
          ],
          target: 'email',
        },
        LOGIN_PHONE: {
          actions: [
            assign({
              phoneNumber: ({ event }) => event.phoneNumber,
            }),
          ],
          target: 'phone',
        },
      },
    },
    email: {
      invoke: {
        src: 'signUpOrLogin',
        input: ({ context }) => ({ email: context.email! }),
        onDone: [
          {
            guard: ({ event }) => event.output.stage === 'verify',
            target: 'verifyOtp',
            actions: [
              assign({
                authState: ({ event }) => event.output,
              }),
            ],
          },
          {
            guard: ({ event }) => event.output.stage === 'login',
            target: 'login',
            actions: [
              assign({
                authState: ({ event }) => event.output,
              }),
            ],
          },
        ],
      },
    },
    phone: {
      invoke: {
        src: 'signUpOrLogin',
        input: ({ context }) => ({ phone: context.phoneNumber! }),
        onDone: [
          {
            guard: ({ event }) => event.output.stage === 'verify',
            target: 'verifyOtp',
            actions: [
              assign({
                authState: ({ event }) => event.output,
              }),
            ],
          },
          {
            guard: ({ event }) => event.output.stage === 'login',
            target: 'login',
            actions: [
              assign({
                authState: ({ event }) => event.output,
              }),
            ],
          },
        ],
      },
    },
    verifyOtp: {
      initial: 'input',
      states: {
        input: {
          on: {
            VERIFY_OTP: {
              actions: [
                assign({
                  verificationCode: ({ event }) => event.verificationCode,
                }),
              ],
              target: 'verify',
            },
          },
        },
        verify: {
          invoke: {
            src: 'verifyNewAccount',
            input: ({ context }) => context.verificationCode!,
            onDone: {
              actions: [
                assign({
                  authState: ({ event }) => event.output,
                }),
              ],
              target: 'success',
            },
          },
        },
        success: {
          type: 'final',
        },
      },
      onDone: {
        target: 'signup',
      },
    },
    signup: {
      initial: 'selectMethod',
      states: {
        selectMethod: {
          always: {
            target: 'waitForWalletCreation',
          },
          entry: [
            {
              type: 'openPopupWindow',
              params: ({ context }) => {
                const authState = context.authState as AuthStateSignup
                return {
                  url:
                    (authState.isPasskeySupported && authState.passkeyUrl) ||
                    authState.passwordUrl,
                }
              },
            },
          ],
        },
        waitForWalletCreation: {
          invoke: {
            src: 'waitForWalletCreation',
            input: ({ context }) => context.popupWindow,
            onDone: {
              target: 'success',
            },
          },
        },
        success: {
          type: 'final',
        },
      },
      onDone: {
        target: 'success',
      },
    },
    login: {
      entry: [
        {
          type: 'openPopupWindow',
          params: ({ context }) => {
            const authState = context.authState as AuthStateLogin
            return { url: authState.passkeyUrl ?? authState.passwordUrl }
          },
        },
      ],
      invoke: {
        src: 'waitForLogin',
        input: ({ context }) => context.popupWindow,
        onDone: [
          {
            guard: ({ event }) => !!event.output.needsWallet,
            target: 'needsWallet',
          },
          {
            guard: ({ event }) => !event.output.needsWallet,
            target: 'success',
          },
        ],
      },
    },
    needsWallet: {},
    success: {},
  },
  on: {
    CLOSE: {
      target: '.closed',
    },
  },
})

export const paraMachine = createActor(machine)
paraMachine.start()
