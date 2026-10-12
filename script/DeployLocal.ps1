# PowerShell helper script to deploy Prism locally to Anvil
$ErrorActionPreference = "Stop"

$rpcUrl = "http://127.0.0.1:8545"
$anvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

Write-Host "==> Checking if local Anvil node is active at $rpcUrl..."
$anvilActive = $false
try {
    $res = Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res -and $res.result) { $anvilActive = $true }
} catch {
    $anvilActive = $false
}

if (-not $anvilActive) {
    Write-Host "==> Starting Anvil (chainId 31337) in background..."
    Start-Process -FilePath "$HOME\.foundry\bin\anvil.exe" -ArgumentList "--port 8545 --chain-id 31337" -WindowStyle Hidden
    Start-Sleep -Seconds 2
} else {
    Write-Host "    Anvil is already running."
}

Write-Host "==> Deploying Prism contracts to local Anvil..."
$env:PRIVATE_KEY = $anvilKey
& "$HOME\.foundry\bin\forge.exe" script script/Deploy.s.sol:DeployScript --rpc-url $rpcUrl --broadcast

Write-Host "==> Extracting deployment addresses and ABIs for web..."
node web/scripts/extract-artifacts.mjs

Write-Host "==> Local deployment complete."
