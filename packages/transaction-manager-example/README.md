# Transaction Manager Example App

A runnable example demonstrating all features of the ENS Transaction Manager library.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Build the transaction-manager library first
cd ../transaction-manager && pnpm build && cd ../transaction-manager-example

# Start the example app
pnpm dev
```

The app will open at http://localhost:5173

## 🎯 Features Demonstrated

### 1. EOA Transactions
- Standard Ethereum transactions
- Retry mechanism
- Error handling
- Debug report export

### 2. ERC-4337 Smart Account
- User Operation creation
- Bundler integration flow
- Smart account transaction simulation

### 3. Multi-Step Flow
- Commit-reveal pattern (like ENS registration)
- Transaction sequencing
- Wait periods between transactions
- State management across multiple transactions

### 4. Audit Trail Dashboard
- Real-time transaction history
- Performance metrics
- Error tracking
- Debug report generation
- Export/import audit data

## 🔧 Configuration

### WalletConnect Project ID
To use WalletConnect, update the project ID in `src/wagmi.config.ts`:

```typescript
export const config = getDefaultConfig({
  appName: 'ENS Transaction Manager Example',
  projectId: 'YOUR_PROJECT_ID_HERE', // Get from https://cloud.walletconnect.com
  // ...
})
```

### Network Configuration
By default, the app supports:
- Ethereum Mainnet
- Sepolia Testnet
- Localhost (for development)

## 📝 Usage Guide

### Testing EOA Transactions

1. Connect your wallet using the Connect button
2. Go to the "EOA Transaction" tab
3. Enter a recipient address and amount
4. Click "Send ETH"
5. Approve in your wallet
6. Watch the transaction states progress
7. Export debug report when complete

### Testing Multi-Step Flows

1. Go to the "Multi-Step Flow" tab
2. Enter a name to "register"
3. Click "Start Registration Flow"
4. Watch the commit transaction execute
5. Wait for the countdown (10 seconds in demo)
6. Complete the registration transaction
7. See the complete flow status

### Using the Audit Trail

1. Go to the "Audit Trail" tab
2. Perform some transactions in other tabs
3. Click "View History" to see all state transitions
4. Click "Generate Report" for performance metrics
5. Use "Export Audit" to download the complete audit log
6. Enable "Auto-refresh" to see live updates

## 🏗️ Architecture

```
src/
├── App.tsx                 # Main app component with tabs
├── wagmi.config.ts        # Wagmi/RainbowKit configuration
├── main.tsx              # App entry point with providers
├── index.css             # Styles
└── examples/
    ├── EOATransaction.tsx      # Standard transaction example
    ├── ERC4337Transaction.tsx  # Smart account example
    ├── MultiStepFlow.tsx       # Multi-transaction flow
    └── AuditTrailDashboard.tsx # Debug and audit features
```

## 🧪 Testing Different Scenarios

### Success Case
- Use small amounts on testnets
- Ensure wallet has sufficient balance

### Error Cases
- Reject transaction in wallet
- Use insufficient balance
- Disconnect wallet mid-transaction

### Recovery Testing
- Use retry button after failures
- Export debug reports for failed transactions
- Test page refresh during transactions

## 🐛 Troubleshooting

### "No wallet connected"
- Click the Connect button
- Select your wallet
- Approve connection

### "Transaction failed"
- Check wallet balance
- Verify network selection
- Export debug report for details

### "4337 not working"
- This is a simulation - requires bundler setup for production
- Check console for detailed errors

## 📚 Learn More

- [Transaction Manager Documentation](../transaction-manager/README.md)
- [ENS Documentation](https://docs.ens.domains)
- [Wagmi Documentation](https://wagmi.sh)
- [RainbowKit Documentation](https://rainbowkit.com)