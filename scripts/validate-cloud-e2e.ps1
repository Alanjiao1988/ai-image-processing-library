[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [int]$LocalPort = 3101,
    [int]$StartupTimeoutSeconds = 60,
    [int]$JobTimeoutSeconds = 420,
    [string]$Prompt = "一只穿着宇航服的猫咪在月球上散步，企业海报风格，高清插画"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$apiEntry = Join-Path $repoRoot "apps\api\dist\index.js"
$outLog = Join-Path $repoRoot ".deployment-artifacts\local-validation-api.out.log"
$errLog = Join-Path $repoRoot ".deployment-artifacts\local-validation-api.err.log"
$azChinaPath = Join-Path $repoRoot "az-china.cmd"

if (-not (Test-Path $apiEntry)) {
    throw "API build output is missing at $apiEntry. Run 'npm run build --workspace @ai-image-app/api' first."
}

if (-not (Test-Path (Split-Path $outLog -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $outLog -Parent) | Out-Null
}

function Invoke-AzChinaJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandText
    )

    $output = & cmd.exe /d /s /c "`"$azChinaPath`" $CommandText --only-show-errors" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: $CommandText`n$output"
    }

    return ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

function Wait-UntilReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 5
            return $response
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "Timed out waiting for $Uri to become ready within $TimeoutSeconds seconds."
}

function Stop-ValidationProcess {
    param([System.Diagnostics.Process]$Process)

    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force
        $Process.WaitForExit()
    }
}

$appSettings = Invoke-AzChinaJson "webapp config appsettings list --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId -o json"

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = "node"
$startInfo.Arguments = $apiEntry
$startInfo.WorkingDirectory = "$repoRoot"
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true

foreach ($setting in $appSettings) {
    if ($null -ne $setting.value -and $setting.name -ne "PORT") {
        $startInfo.Environment[$setting.name] = [string]$setting.value
    }
}

$startInfo.Environment["PORT"] = [string]$LocalPort
$startInfo.Environment["CORS_ORIGIN"] = "http://localhost:4173"

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo

try {
    if (Test-Path $outLog) {
        Remove-Item $outLog -Force
    }
    if (Test-Path $errLog) {
        Remove-Item $errLog -Force
    }

    $process.Start() | Out-Null

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()

    $ping = Wait-UntilReady -Uri "http://127.0.0.1:$LocalPort/api/ping" -TimeoutSeconds $StartupTimeoutSeconds
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/health/summary" -Method Get -TimeoutSec 20

    $jobCreate = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/image/text-to-image" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{ prompt = $Prompt } | ConvertTo-Json) `
        -TimeoutSec 30

    if (-not $jobCreate.jobId) {
        throw "Job creation did not return a jobId."
    }

    $jobDeadline = (Get-Date).AddSeconds($JobTimeoutSeconds)
    $job = $null

    while ((Get-Date) -lt $jobDeadline) {
        Start-Sleep -Seconds 5
        $job = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/jobs/$($jobCreate.jobId)" -Method Get -TimeoutSec 20

        if ($job.status -in @("SUCCEEDED", "FAILED")) {
            break
        }
    }

    if ($null -eq $job) {
        throw "Job polling never returned a job payload."
    }

    $downloadBytes = $null
    if ($job.status -eq "SUCCEEDED" -and $job.resultImageUrl) {
        $download = Invoke-WebRequest -Uri ("http://127.0.0.1:$LocalPort" + $job.resultImageUrl) -Method Get -TimeoutSec 60
        $downloadBytes = $download.RawContentLength
    }

    $result = [ordered]@{
        localApiBaseUrl = "http://127.0.0.1:$LocalPort"
        ping = $ping
        health = $health
        createdJob = $jobCreate
        finalJob = $job
        downloadedImageBytes = $downloadBytes
    }

    $result | ConvertTo-Json -Depth 10

    if ($job.status -ne "SUCCEEDED") {
        exit 1
    }
}
finally {
    if ($null -ne $process) {
        if (-not $process.HasExited) {
            Stop-ValidationProcess -Process $process
        }

        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        Set-Content -LiteralPath $outLog -Value $stdout -Encoding UTF8
        Set-Content -LiteralPath $errLog -Value $stderr -Encoding UTF8
    }
}
