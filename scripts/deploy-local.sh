#!/usr/bin/env bash
# Bash script for one-command local Prism deployment to Anvil (Chain ID 31337)
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RPC_URL="http://127.0.0.1:8545"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

echo "==> [1/4] Checking local Anvil node at $RPC_URL..."
if ! curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | grep -q "0x7a69"; then
    echo "==> Starting Anvil (chainId 31337) in background..."
    anvil --port 8545 --chain-id 31337 >/dev/null 2>&1 &
    ANVIL_PID=$!
    
    # Wait for Anvil to start
    RETRIES=10
    until curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | grep -q "0x7a69" || [ $RETRIES -eq 0 ]; do
        sleep 1
        RETRIES=$((RETRIES - 1))
    done
    
    if [ $RETRIES -eq 0 ]; then
        echo "Error: Failed to start local Anvil node at $RPC_URL" >&2
        exit 1
    fi
    echo "    Anvil started successfully."
else
    echo "    Anvil is already running."
fi

echo "==> [2/4] Deploying Prism contracts to local Anvil..."
PRIVATE_KEY="$ANVIL_KEY" forge script script/Deploy.s.sol:DeployScript --rpc-url "$RPC_URL" --broadcast

# Resolve PrincipalToken and EpochCoupon from PrismVault via cast if needed
VAULT_ADDR=$(grep -o '"PrismVault": "[^"]*"' "$PROJECT_ROOT/broadcast/Deploy.s.sol/31337/run-latest.json" | cut -d'"' -f4 || true)
if [ -z "$VAULT_ADDR" ]; then
    VAULT_ADDR=$(node -e "const r=require('$RUN_LATEST_PATH');const tx=r.transactions.find(t=>t.contractName==='PrismVault');console.log(tx?tx.contractAddress:'');")
fi

node web/scripts/extract-artifacts.mjs

echo ""
echo "=========================================================="
echo "   Prism Local Deployment Succeeded (Chain ID: 31337)"
echo "=========================================================="
cat "$PROJECT_ROOT/web/src/chain/deployments.local.json"
echo "=========================================================="
