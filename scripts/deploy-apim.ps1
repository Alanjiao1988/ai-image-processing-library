<#
.SYNOPSIS
  Deploy the OpenAI Images APIM gateway.

.DESCRIPTION
  Two-phase deployment on Azure Global:
  1. (Optional) Provision Azure OpenAI resource + gpt-image-1.5 deployment
  2. Add isolated openai-images-v1 API to an existing APIM instance

  Prerequisites:
  - Azure CLI logged in to AzureCloud
  - Bicep CLI available (bundled with az CLI)

.PARAMETER Phase
  Which phase to run: 'foundry', 'apim', or 'all' (default: 'all')

.PARAMETER ApimName
  Name of the existing APIM instance (default: __REPLACE_WITH_APIM_NAME__)

.PARAMETER ApimResourceGroup
  Resource group of the APIM instance (default: default-activitylogalerts)

.PARAMETER Subscription
  Azure subscription ID (default: 943bacdf-8b6e-4e3a-8126-a149f623d32e)

.PARAMETER FoundryResourceGroup
  Resource group for the Azure OpenAI resource (can differ from APIM RG)

.PARAMETER OpenAiName
  Name for the Azure OpenAI resource

.PARAMETER FoundryEndpoint
  Pre-existing Foundry endpoint (skip Foundry phase if provided)

.PARAMETER FoundryKey
  Pre-existing Foundry API key

.PARAMETER GatewayToken
  Bearer token that callers use to authenticate to the APIM gateway
#>
[CmdletBinding()]
param(
    [ValidateSet('foundry', 'apim', 'all')]
    [string]$Phase = 'all',

    [string]$ApimName = '__REPLACE_WITH_APIM_NAME__',
    [string]$ApimResourceGroup = '__REPLACE_WITH_APIM_RESOURCE_GROUP__',
    [string]$Subscription = '__REPLACE_WITH_AZURE_GLOBAL_SUBSCRIPTION__',

    [string]$FoundryResourceGroup,
    [string]$OpenAiName,

    [string]$FoundryEndpoint,
    [string]$FoundryKey,
    [string]$GatewayToken
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$IacDir = Join-Path $ScriptDir 'iac'

# Ensure Azure Global cloud
az cloud set --name AzureCloud 2>$null
az account set --subscription $Subscription

# ─── Phase 1: Foundry ─────────────────────────────────────────────────────────
if ($Phase -in @('foundry', 'all')) {
    if ($FoundryEndpoint -and $FoundryKey) {
        Write-Host "[Foundry] Using pre-existing endpoint: $FoundryEndpoint" -ForegroundColor Cyan
    }
    else {
        if (-not $FoundryResourceGroup) { throw "FoundryResourceGroup is required for Foundry provisioning" }
        if (-not $OpenAiName) { throw "OpenAiName is required for Foundry provisioning" }

        Write-Host "[Foundry] Ensuring resource group '$FoundryResourceGroup'..." -ForegroundColor Cyan
        az group create --name $FoundryResourceGroup --location eastus --output none 2>$null

        Write-Host "[Foundry] Deploying foundry.bicep..." -ForegroundColor Cyan
        $foundryResult = az deployment group create `
            --resource-group $FoundryResourceGroup `
            --template-file (Join-Path $IacDir 'foundry.bicep') `
            --parameters openAiName=$OpenAiName `
            --query 'properties.outputs' `
            -o json | ConvertFrom-Json

        $FoundryEndpoint = $foundryResult.endpoint.value
        Write-Host "[Foundry] Endpoint: $FoundryEndpoint" -ForegroundColor Green

        # Retrieve key
        $FoundryKey = az cognitiveservices account keys list `
            --resource-group $FoundryResourceGroup `
            --name $OpenAiName `
            --query 'key1' -o tsv
        Write-Host "[Foundry] Key retrieved." -ForegroundColor Green
    }
}

# ─── Phase 2: APIM ────────────────────────────────────────────────────────────
if ($Phase -in @('apim', 'all')) {
    if (-not $ApimName) { throw "ApimName is required for APIM deployment" }
    if (-not $FoundryEndpoint) { throw "FoundryEndpoint is required (run foundry phase first or provide it)" }
    if (-not $FoundryKey) { throw "FoundryKey is required (run foundry phase first or provide it)" }
    if (-not $GatewayToken) {
        Write-Host "[APIM] Generating random gateway Bearer token..." -ForegroundColor Cyan
        $GatewayToken = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 })) -replace '[+/=]', ''
        $GatewayToken = $GatewayToken.Substring(0, [Math]::Min(48, $GatewayToken.Length))
        Write-Host "[APIM] Generated token (save this!): $GatewayToken" -ForegroundColor Yellow
    }

    Write-Host "[APIM] Deploying main.bicep to APIM '$ApimName' in RG '$ApimResourceGroup'..." -ForegroundColor Cyan
    $apimResult = az deployment group create `
        --resource-group $ApimResourceGroup `
        --template-file (Join-Path $IacDir 'main.bicep') `
        --parameters `
            apimName=$ApimName `
            foundryEndpoint=$FoundryEndpoint `
            foundryApiKey=$FoundryKey `
            gatewayBearerToken=$GatewayToken `
        --query 'properties.outputs' `
        -o json | ConvertFrom-Json

    Write-Host "`n[APIM] Deployment complete!" -ForegroundColor Green
    Write-Host "  Gateway URL: $($apimResult.gatewayUrl.value)" -ForegroundColor Green
    Write-Host "  API ID:      $($apimResult.apiId.value)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Endpoints:" -ForegroundColor Cyan
    Write-Host "  POST $($apimResult.gatewayUrl.value)/images/generations"
    Write-Host "  POST $($apimResult.gatewayUrl.value)/images/edits"
    Write-Host "  POST $($apimResult.gatewayUrl.value)/images/variations"
    Write-Host "  GET  $($apimResult.gatewayUrl.value)/health"
    Write-Host ""
    Write-Host "Bearer token: $GatewayToken" -ForegroundColor Yellow
}

Write-Host "`nDone." -ForegroundColor Green
