[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"

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

$filesToUpload = @(
    @{
        localPath = Join-Path $repoRoot "apps\api\dist\routes\image.routes.js"
        remotePath = "/api/vfs/site/wwwroot/dist/routes/image.routes.js"
    },
    @{
        localPath = Join-Path $repoRoot "apps\api\dist\services\jobs\job.service.js"
        remotePath = "/api/vfs/site/wwwroot/dist/services/jobs/job.service.js"
    },
    @{
        localPath = Join-Path $repoRoot "apps\api\dist\services\storage\blob-storage.service.js"
        remotePath = "/api/vfs/site/wwwroot/dist/services/storage/blob-storage.service.js"
    },
    @{
        localPath = Join-Path $repoRoot "apps\api\dist\utils\image-upload.js"
        remotePath = "/api/vfs/site/wwwroot/dist/utils/image-upload.js"
    }
)

foreach ($entry in $filesToUpload) {
    if (-not (Test-Path $entry.localPath)) {
        throw "Missing local compiled file: $($entry.localPath)"
    }
}

$accessToken = (Invoke-AzChina "account get-access-token --resource https://appservice.azure.cn --subscription $SubscriptionId --query accessToken -o tsv").Trim()
$apiHostName = (Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId --query defaultHostName -o tsv").Trim()
$scmHostName = $apiHostName -replace "\.chinacloudsites\.cn$", ".scm.chinacloudsites.cn"

foreach ($entry in $filesToUpload) {
    $url = "https://$scmHostName$($entry.remotePath)"
    Invoke-RestMethod -Uri $url -Method Put -Headers @{
        Authorization = "Bearer $accessToken"
        "If-Match" = "*"
    } -InFile $entry.localPath -ContentType "application/octet-stream" | Out-Null
}

Invoke-AzChina "webapp restart --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId" | Out-Null

Write-Host "Hotfix runtime files uploaded and API app restarted."
