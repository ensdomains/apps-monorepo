// lib/Para/index.ts

// Export the original Para instance
export { para } from './Para'

// Export all Para service functions
export {
  cleanup,
  getAccount,
  getAddress,
  getBalance,
  getChain,
  getChainId,
  getCurrentChain,
  // Utility functions
  getParaInstance,
  getProviderInstance,
  // Blockchain interactions
  getPublicClient,
  getStablecoinBalances,
  getStatus,
  getUser,
  // User management
  getUserInfo,
  getWalletClient,
  // Core initialization and connection
  initializePara,
  isConnected,
  isLoggedIn,
  isReady,
  logout,
  type ParaAuthResult,
  // Types
  type ParaUserInfo,
  type ParaWallet,
  readContract,
  type StablecoinBalance,
  sendTransaction,
  // Authentication
  signUpOrLogIn,
  // Chain management
  switchChain,
  verifyNewAccount,
  waitForLogin,
  writeContract,
  writeContractWithValue,
} from './paraService'
