#!/usr/bin/env bash
set -euo pipefail

# Find foundry binaries
ANVIL_BIN="$(command -v anvil || echo "$HOME/.foundry/bin/anvil")"
FORGE_BIN="$(command -v forge || echo "$HOME/.foundry/bin/forge")"

RPC_URL="http://127.0.0.1:8545"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

echo "==> Checking if local Anvil node is active at $RPC_URL..."
if ! curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" > /dev/null 2>&1; then
  echo "==> Starting Anvil (chainId 31337) in background..."
  "$ANVIL_BIN" --port 8545 --chain-id 31337 > anvil.log 2>&1 &
  ANVIL_PID=$!
  echo "    Anvil launched (PID: $ANVIL_PID). Waiting for RPC readiness..."
  
  for i in {1..30}; do
    if curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$RPC_URL" > /dev/null 2>&1; then
      echo "    Anvil is ready."
      break
    fi
    sleep 0.5
  done
else
  echo "    Anvil is already running."
fi

echo "==> Deploying Prism contracts to local Anvil..."
PRIVATE_KEY="$ANVIL_KEY" "$FORGE_BIN" script script/Deploy.s.sol:DeployScript --rpc-url "$RPC_URL" --broadcast

echo "==> Extracting deployment addresses and ABIs for web..."
node web/scripts/extract-artifacts.mjs

echo "==> Local deployment complete."
