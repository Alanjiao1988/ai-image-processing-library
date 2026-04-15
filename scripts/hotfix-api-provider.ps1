[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"
$providerFile = Join-Path $repoRoot "apps\api\dist\providers\gpt-image.provider.js"

function Invoke-AzChina {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandText
    )

    $output = & cmd.exe /d /s /c "`"$azChinaPath`" $CommandText --only-show-errors" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: $CommandText`n$output"
    }

    if ($output -is [System.Array]) {
        return ($output -join [Environment]::NewLine)
    }

    return "$output"
}

if (-not (Test-Path $providerFile)) {
    throw "Compiled provider file is missing at $providerFile."
}

$accessToken = (Invoke-AzChina "account get-access-token --resource https://appservice.azure.cn --subscription $SubscriptionId --query accessToken -o tsv").Trim()
$apiHostName = (Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId --query defaultHostName -o tsv").Trim()
$scmHostName = $apiHostName -replace "\.chinacloudsites\.cn$", ".scm.chinacloudsites.cn"
$kuduUrl = "https://$scmHostName/api/vfs/site/wwwroot/dist/providers/gpt-image.provider.js"

Invoke-RestMethod -Uri $kuduUrl -Method Put -Headers @{
    Authorization = "Bearer $accessToken"
    "If-Match" = "*"
} -InFile $providerFile -ContentType "application/octet-stream" | Out-Null

Invoke-AzChina "webapp restart --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId" | Out-Null

Write-Host "Hotfix uploaded and API app restarted."
