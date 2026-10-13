# PowerShell script for one-command local Prism deployment to Anvil (Chain ID 31337)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

$rpcUrl = "http://127.0.0.1:8545"
$anvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
$anvilExe = "$HOME\.foundry\bin\anvil.exe"
$forgeExe = "$HOME\.foundry\bin\forge.exe"
$castExe = "$HOME\.foundry\bin\cast.exe"

Write-Host "==> [1/4] Checking local Anvil node at $rpcUrl..."
$anvilActive = $false
try {
    $res = Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res -and $res.result) { $anvilActive = $true }
} catch {
    $anvilActive = $false
}

if (-not $anvilActive) {
    Write-Host "==> Starting Anvil (chainId 31337) in background..."
    if (Test-Path $anvilExe) {
        Start-Process -FilePath $anvilExe -ArgumentList "--port 8545 --chain-id 31337" -WindowStyle Hidden
    } else {
        Start-Process -FilePath "anvil" -ArgumentList "--port 8545 --chain-id 31337" -WindowStyle Hidden
    }
    
    # Wait up to 10 seconds for Anvil to become responsive
    $retries = 10
    while ($retries -gt 0 -and -not $anvilActive) {
        Start-Sleep -Seconds 1
        try {
            $res = Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($res -and $res.result) { $anvilActive = $true }
        } catch { }
        $retries--
    }
    
    if (-not $anvilActive) {
        Write-Error "Failed to start local Anvil node at $rpcUrl."
    }
    Write-Host "    Anvil started successfully."
} else {
    Write-Host "    Anvil is already running."
}

Write-Host "==> [2/4] Deploying Prism contracts to local Anvil..."
$env:PRIVATE_KEY = $anvilKey

if (Test-Path $forgeExe) {
    & $forgeExe script script/Deploy.s.sol:DeployScript --rpc-url $rpcUrl --broadcast
} else {
    forge script script/Deploy.s.sol:DeployScript --rpc-url $rpcUrl --broadcast
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Forge script deployment failed."
}

Write-Host "==> [3/4] Parsing broadcast artifacts and extracting deployed addresses..."
$runLatestPath = Join-Path $projectRoot "broadcast/Deploy.s.sol/31337/run-latest.json"
if (-not (Test-Path $runLatestPath)) {
    Write-Error "run-latest.json not found at $runLatestPath"
}

$runLatest = Get-Content $runLatestPath -Raw | ConvertFrom-Json

$contracts = @{}
foreach ($tx in $runLatest.transactions) {
    if ($tx.transactionType -eq "CREATE" -and $tx.contractName -and $tx.contractAddress) {
        $contracts[$tx.contractName] = $tx.contractAddress
    }
}

# Resolve PrincipalToken and EpochCoupon directly from PrismVault
$vaultAddress = $contracts["PrismVault"]
if ($vaultAddress) {
    $castCmd = if (Test-Path $castExe) { $castExe } else { "cast" }
    
    $pt = & $castCmd call $vaultAddress "principalToken()(address)" --rpc-url $rpcUrl
    if ($pt -and $pt -match "0x[0-9a-fA-F]{40}") {
        $contracts["PrincipalToken"] = $matches[0]
    }
    
    $ec = & $castCmd call $vaultAddress "epochCoupon()(address)" --rpc-url $rpcUrl
    if ($ec -and $ec -match "0x[0-9a-fA-F]{40}") {
        $contracts["EpochCoupon"] = $matches[0]
    }
}

$deployments = @{
    chainId = 31337
    contracts = $contracts
}

$outDeploymentsPath = Join-Path $projectRoot "web/src/chain/deployments.local.json"
$deployments | ConvertTo-Json -Depth 5 | Set-Content $outDeploymentsPath -Encoding UTF8
Write-Host "    Saved local deployments to $outDeploymentsPath"

Write-Host "==> [4/4] Extracting contract ABIs for web frontend..."
node web/scripts/extract-artifacts.mjs

Write-Host ""
Write-Host "=========================================================="
Write-Host "   Prism Local Deployment Succeeded (Chain ID: 31337)"
Write-Host "=========================================================="
foreach ($key in $contracts.Keys) {
    Write-Host ("   {0,-20} : {1}" -f $key, $contracts[$key])
}
Write-Host "=========================================================="
