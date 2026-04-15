[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"
$artifactRoot = Join-Path $repoRoot ".deployment-artifacts\api-only"
$deployPath = Join-Path $artifactRoot "package"
$zipPath = Join-Path $artifactRoot "api-only.zip"

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

npm run build --workspace @ai-image-app/api
if ($LASTEXITCODE -ne 0) {
    throw "API build failed."
}

$apiPackage = Get-Content (Join-Path $repoRoot "apps\api\package.json") | ConvertFrom-Json -AsHashtable
$dependencies = [ordered]@{}

foreach ($dependency in ($apiPackage.dependencies.Keys | Sort-Object)) {
    $dependencies[$dependency] = $apiPackage.dependencies[$dependency]
}

if (-not $dependencies.Contains("prisma")) {
    $dependencies["prisma"] = $apiPackage.devDependencies["prisma"]
}

$deployPackage = [ordered]@{
    name = "@ai-image-app/api-deploy"
    version = $apiPackage.version
    private = $true
    scripts = [ordered]@{
        start = "node dist/index.js"
    }
    dependencies = $dependencies
}

$deployPackage | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $deployPath "package.json") -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $repoRoot "apps\api\dist") -Destination (Join-Path $deployPath "dist") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "apps\api\prisma") -Destination (Join-Path $deployPath "prisma") -Recurse -Force

Push-Location $deployPath
try {
    npm install --omit=dev --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "API runtime dependency install failed."
    }

    .\node_modules\.bin\prisma generate --schema prisma/schema.prisma | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Prisma client generation for deploy artifact failed."
    }
}
finally {
    Pop-Location
}

Compress-Archive -Path (Join-Path $deployPath "*") -DestinationPath $zipPath -Force

Invoke-AzChina "webapp deploy --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId --src-path ""$zipPath"" --type zip --clean true --restart true --track-status true --timeout 1800000 -o none" | Out-Null

Write-Host "API app deployment completed."
