<#
.SYNOPSIS
  Validate the deployed OpenAI Images APIM gateway.

.PARAMETER GatewayBaseUrl
  The APIM gateway base URL including /v1 (e.g. https://my-apim.azure-api.cn/v1)

.PARAMETER BearerToken
  The gateway Bearer token

.PARAMETER SkipImageGeneration
  Skip actual image generation test (avoid cost)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$GatewayBaseUrl,

    [Parameter(Mandatory)]
    [string]$BearerToken,

    [switch]$SkipImageGeneration
)

$ErrorActionPreference = 'Stop'
$headers = @{ 'Authorization' = "Bearer $BearerToken"; 'Content-Type' = 'application/json' }
$passed = 0
$failed = 0

function Test-Endpoint {
    param([string]$Name, [scriptblock]$Test)
    Write-Host "`n─── $Name ───" -ForegroundColor Cyan
    try {
        & $Test
        Write-Host "  PASS" -ForegroundColor Green
        $script:passed++
    }
    catch {
        Write-Host "  FAIL: $_" -ForegroundColor Red
        $script:failed++
    }
}

# ── 1. Health endpoint ──
Test-Endpoint "GET /health" {
    $resp = Invoke-RestMethod -Uri "$GatewayBaseUrl/health" -Headers $headers -Method GET
    if (-not $resp.success) { throw "success != true" }
    if ($resp.service -ne 'ai-gateway') { throw "service != ai-gateway, got: $($resp.service)" }
    if (-not $resp.request_id) { throw "missing request_id" }
    if (-not $resp.dependencies.apim) { throw "missing dependencies.apim" }
    if (-not $resp.dependencies.foundry) { throw "missing dependencies.foundry" }
    Write-Host "  status=$($resp.status), foundry=$($resp.dependencies.foundry.status)"
}

# ── 2. No auth → 401 ──
Test-Endpoint "No auth → UNAUTHORIZED" {
    try {
        $null = Invoke-RestMethod -Uri "$GatewayBaseUrl/health" -Method GET -ErrorAction Stop
        throw "Expected 401 but succeeded"
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -ne 401) { throw "Expected 401, got $status" }
        $body = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($body.error.code -ne 'UNAUTHORIZED') { throw "Expected UNAUTHORIZED, got $($body.error.code)" }
        Write-Host "  Got expected 401 UNAUTHORIZED"
    }
}

# ── 3. Wrong token → 401 ──
Test-Endpoint "Wrong token → UNAUTHORIZED" {
    try {
        $badHeaders = @{ 'Authorization' = 'Bearer wrong-token-here' }
        $null = Invoke-RestMethod -Uri "$GatewayBaseUrl/health" -Headers $badHeaders -Method GET -ErrorAction Stop
        throw "Expected 401 but succeeded"
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -ne 401) { throw "Expected 401, got $status" }
        Write-Host "  Got expected 401"
    }
}

# ── 4. Subscription key → 401 ──
Test-Endpoint "Subscription-key → UNAUTHORIZED" {
    try {
        $skHeaders = @{ 'Ocp-Apim-Subscription-Key' = 'some-key'; 'Authorization' = "Bearer $BearerToken" }
        $null = Invoke-RestMethod -Uri "$GatewayBaseUrl/health" -Headers $skHeaders -Method GET -ErrorAction Stop
        throw "Expected 401 but succeeded"
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -ne 401) { throw "Expected 401, got $status" }
        $body = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($body.error.code -ne 'UNAUTHORIZED') { throw "Expected UNAUTHORIZED, got $($body.error.code)" }
        Write-Host "  Subscription-key rejected as expected"
    }
}

# ── 5. Generations (optional) ──
if (-not $SkipImageGeneration) {
    Test-Endpoint "POST /images/generations" {
        $body = @{
            prompt = 'A simple red circle on white background'
            size   = '1024x1024'
            n      = 1
        } | ConvertTo-Json

        $resp = Invoke-RestMethod -Uri "$GatewayBaseUrl/images/generations" `
            -Headers $headers -Method POST -Body $body -TimeoutSec 180
        if (-not $resp.success) { throw "success != true" }
        if ($resp.mode -ne 'text_to_image') { throw "mode != text_to_image, got: $($resp.mode)" }
        if ($resp.images.Count -lt 1) { throw "no images returned" }
        if (-not $resp.images[0].b64_json) { throw "missing b64_json" }
        Write-Host "  Got $($resp.images.Count) image(s), provider=$($resp.provider)"
    }
}
else {
    Write-Host "`n─── POST /images/generations ───" -ForegroundColor DarkGray
    Write-Host "  SKIPPED (use -SkipImageGeneration:`$false to enable)" -ForegroundColor DarkGray
}

# ── Summary ──
Write-Host "`n═══════════════════════════════════════" -ForegroundColor White
Write-Host "  Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "═══════════════════════════════════════" -ForegroundColor White

if ($failed -gt 0) { exit 1 }
