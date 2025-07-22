# 🚀 Debug Instructions for ENS Registration

## Quick Setup for Testing ENS Registration

### **1. Start NameChain (Devnet)**
```bash
# In the root directory
bun run devnet
```

### **2. Start Manager App**
```bash
# In a new terminal, from the manager directory
cd apps/manager
pnpm run dev
```

### **3. Setup MetaMask for Testing**

#### **Import Anvil Private Key:**
1. **Open MetaMask**
2. **Add Network:**
   - Network Name: `Anvil`
   - RPC URL: `http://127.0.0.1:8546`
   - Chain ID: `31338`
   - Currency Symbol: `ETH`

3. **Import Private Key:**
   - Click **Import Account**
   - Use this private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This account has **10,000 ETH** for testing

### **4. Test Registration**

#### **Steps:**
1. **Connect Wallet** to the manager app
2. **Enter a domain name** (e.g., `testname123`)
3. **Select duration** (1 year)
4. **Click "Register"**
5. **Confirm commit transaction** in MetaMask
6. **Wait 60 seconds** for timer
7. **Confirm registration transaction** in MetaMask

#### **Expected Flow:**
```
Pricing → Commit → Wait (60s) → Register → Success
```

### **5. Troubleshooting**

#### **If you get "Insufficient funds" error:**
- Make sure you're connected to the **Anvil network** (Chain ID: 31338)
- Verify the imported account has ETH balance
- Check that the RPC URL is correct: `http://127.0.0.1:8546`

#### **If transactions fail:**
- Ensure NameChain devnet is running (`bun run devnet`)
- Check that both terminals show no errors
- Verify MetaMask is connected to the correct network

### **6. Debug Info**
- **Manager URL:** `http://localhost:5173`
- **Anvil RPC:** `http://127.0.0.1:8546`
- **Test Account:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

### **7. Common Issues**

#### **"Missing script: dev" error:**
```bash
# Make sure you're in the correct directory
cd apps/manager
pnpm run dev
```

#### **Network connection issues:**
- Verify Anvil is running: `bun run devnet`
- Check RPC URL in MetaMask: `http://127.0.0.1:8546`
- Ensure Chain ID is: `31338`

#### **Transaction stuck:**
- Check gas settings in MetaMask
- Verify account has sufficient ETH
- Try refreshing the page and reconnecting wallet

### **8. Development Tips**

#### **View Debug Info:**
- Open browser console to see detailed logs
- Check network tab for RPC calls
- Monitor transaction status in MetaMask

#### **Reset State:**
- Clear browser localStorage if needed
- Refresh page to reset registration flow
- Disconnect/reconnect wallet if issues persist

---

**Happy testing! 🎉** 