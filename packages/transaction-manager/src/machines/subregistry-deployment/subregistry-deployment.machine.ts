/**
 * Subregistry Deployment Machine
 *
 * Orchestrates the subregistry deployment flow:
 * 1. Deploy subregistry contract via factory
 * 2. Wait for deployment confirmation
 * 3. Set subregistry on parent registry
 * 4. Wait for setSubregistry confirmation
 */

import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, PublicClient, WalletClient } from 'viem'
import { assign, setup } from 'xstate'
import { pollTransactionStatus } from '../../helpers/pollTransactionStatus.actor'
import * as auditTrail from '../../services/audit-trail.service'
import type { EOASigner } from '../../types/signer.types'
import {
  resolveDeployedAddressActor,
  submitDeploySubregistryActor,
  submitSetSubregistryActor,
} from './subregistry-deployment.actors'
import type {
  SubregistryDeploymentContext,
  SubregistryDeploymentEvent,
  SubregistryDeploymentInput,
} from './subregistry-deployment.types'

export const subregistryDeploymentMachine = setup({
  types: {
    context: {} as SubregistryDeploymentContext,
    events: {} as SubregistryDeploymentEvent,
    input: {} as SubregistryDeploymentInput,
  },

  actors: {
    submitDeploy: fromResultAsync(
      (input: {
        name: string
        factoryAddress: Address
        implAddress: Address
        signer: EOASigner
        walletClient: WalletClient
        publicClient: PublicClient
        chainId: number
      }) => submitDeploySubregistryActor(input),
    ),

    resolveDeployedAddress: fromResultAsync((input: { txId: string }) =>
      resolveDeployedAddressActor(input),
    ),

    submitSetSubregistry: fromResultAsync(
      (input: {
        name: string
        label: string
        parentRegistry: Address
        deployedAddress: Address
        signer: EOASigner
        walletClient: WalletClient
        publicClient: PublicClient
        chainId: number
      }) => submitSetSubregistryActor(input),
    ),

    pollTransactionStatus: fromResultAsync((input: { txId: string }) =>
      pollTransactionStatus(input.txId),
    ),
  },

  actions: {
    logTransition: ({ context, event }) => {
      console.log('🔧 [SUBREGISTRY DEPLOYMENT] State transition:', {
        event: event?.type,
        name: context.name,
        deployTxId: context.deployTxId,
        deployedAddress: context.deployedAddress,
        setSubregistryTxId: context.setSubregistryTxId,
      })
    },

    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'subregistry-deployment',
          fromState:
            state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: event?.type || 'unknown',
          context: {
            name: context.name,
            label: context.label,
            factoryAddress: context.factoryAddress,
            parentRegistry: context.parentRegistry,
            deployTxId: context.deployTxId,
            deployedAddress: context.deployedAddress,
            setSubregistryTxId: context.setSubregistryTxId,
          },
          metadata: {
            chainId: context.chainId,
          },
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
    },
  },
}).createMachine({
  id: 'subregistry-deployment',
  initial: 'idle',

  context: ({ input }) => ({
    signer: undefined,
    publicClient: undefined,
    walletClient: undefined,
    chainId: input.chainId,
    name: '',
    label: '',
    factoryAddress: '' as Address,
    implAddress: '' as Address,
    parentRegistry: '' as Address,
    deployTxId: undefined,
    deployedAddress: undefined,
    setSubregistryTxId: undefined,
    error: undefined,
  }),

  states: {
    idle: {
      on: {
        START_DEPLOYMENT: {
          target: 'deploying',
          actions: assign({
            name: ({ event }) => event.name,
            label: ({ event }) => event.name.split('.')[0] ?? '',
            factoryAddress: ({ event }) => event.factoryAddress,
            implAddress: ({ event }) => event.implAddress,
            parentRegistry: ({ event }) => event.parentRegistry,
            signer: ({ event }) => event.signer,
            publicClient: ({ event }) => event.publicClient,
            walletClient: ({ event }) => event.walletClient,
            chainId: ({ event }) => event.chainId,
            // Reset flow state
            deployTxId: () => undefined,
            deployedAddress: () => undefined,
            setSubregistryTxId: () => undefined,
            error: () => undefined,
          }),
        },
      },
    },

    deploying: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitDeploy',
        input: ({ context }) => ({
          name: context.name,
          factoryAddress: context.factoryAddress,
          implAddress: context.implAddress,
          signer: context.signer!,
          walletClient: context.walletClient!,
          publicClient: context.publicClient!,
          chainId: context.chainId,
        }),
        onDone: {
          target: 'waitingForDeployment',
          actions: assign({
            deployTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [SUBREGISTRY DEPLOYMENT] Deploy submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForDeployment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'resolveDeployedAddress',
        input: ({ context }) => ({ txId: context.deployTxId! }),
        onDone: {
          target: 'settingSubregistry',
          actions: assign({
            deployedAddress: ({ event }) => event.output.deployedAddress,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [SUBREGISTRY DEPLOYMENT] Deploy transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    settingSubregistry: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitSetSubregistry',
        input: ({ context }) => ({
          name: context.name,
          label: context.label,
          parentRegistry: context.parentRegistry,
          deployedAddress: context.deployedAddress!,
          signer: context.signer!,
          walletClient: context.walletClient!,
          publicClient: context.publicClient!,
          chainId: context.chainId,
        }),
        onDone: {
          target: 'waitingForSetSubregistry',
          actions: assign({
            setSubregistryTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [SUBREGISTRY DEPLOYMENT] SetSubregistry submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForSetSubregistry: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => ({ txId: context.setSubregistryTxId! }),
        onDone: 'success',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
            }),
            ({ event }) => {
              console.error(
                '❌ [SUBREGISTRY DEPLOYMENT] SetSubregistry transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    success: {
      type: 'final',
      entry: ['logTransition', 'recordTransition'],
    },

    error: {
      entry: [
        'logTransition',
        'recordTransition',
        ({ context }) => {
          console.error(
            '❌ [SUBREGISTRY DEPLOYMENT] Entered error state:',
            context.error?.message,
          )
        },
      ],
      on: {
        RETRY: {
          target: 'deploying',
          actions: assign({
            error: undefined,
            deployTxId: undefined,
            deployedAddress: undefined,
            setSubregistryTxId: undefined,
          }),
        },
        CANCEL: 'idle',
      },
    },
  },
})

export type SubregistryDeploymentMachine = typeof subregistryDeploymentMachine
