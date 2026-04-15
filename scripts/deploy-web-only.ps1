[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$WebAppName = "image-web-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [string]$ApiProxyBaseUrl = "https://image-api-m21426.chinacloudsites.cn",
    [switch]$AllowHttp
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"
$artifactRoot = Join-Path $repoRoot ".deployment-artifacts\web-only"
$deployPath = Join-Path $artifactRoot "package"
$zipPath = Join-Path $artifactRoot "web-only.zip"

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

if (Test-Path $artifactRoot) {
    Remove-Item -LiteralPath $artifactRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $deployPath | Out-Null

$previousApiBaseUrl = $env:VITE_API_BASE_URL
try {
    Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
    npm run build --workspace @ai-image-app/web
    if ($LASTEXITCODE -ne 0) {
        throw "Web build failed."
    }
}
finally {
    if ($null -eq $previousApiBaseUrl) {
        Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:VITE_API_BASE_URL = $previousApiBaseUrl
    }
}

$deployPackage = [ordered]@{
    name = "@ai-image-app/web-deploy"
    version = "0.1.0"
    private = $true
    scripts = [ordered]@{
        start = "node server.js"
    }
}

$deployPackage | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $deployPath "package.json") -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $repoRoot "apps\web\server.js") -Destination (Join-Path $deployPath "server.js") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "apps\web\dist") -Destination (Join-Path $deployPath "dist") -Recurse -Force

Compress-Archive -Path (Join-Path $deployPath "*") -DestinationPath $zipPath -Force

Invoke-AzChina "webapp config appsettings set --resource-group $ResourceGroup --name $WebAppName --subscription $SubscriptionId --settings ""API_PROXY_BASE_URL=$ApiProxyBaseUrl"" -o none" | Out-Null

if ($AllowHttp) {
    Invoke-AzChina "webapp update --resource-group $ResourceGroup --name $WebAppName --subscription $SubscriptionId --set httpsOnly=false -o none" | Out-Null
}

Invoke-AzChina "webapp deploy --resource-group $ResourceGroup --name $WebAppName --subscription $SubscriptionId --src-path ""$zipPath"" --type zip --clean true --restart true --track-status true --timeout 1800000 -o none" | Out-Null

Write-Host "Web app deployment completed."
