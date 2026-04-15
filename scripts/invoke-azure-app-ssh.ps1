[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$AppName,

    [string]$ResourceGroup = "image",

    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",

    [Parameter(Mandatory)]
    [string]$Command,

    [int]$TunnelTimeoutSeconds = 120,

    [int]$PortWaitSeconds = 45,

    [int]$TunnelPort = 62229
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$artifactsDir = Join-Path $repoRoot ".deployment-artifacts"
$azChinaPath = Join-Path $repoRoot "az-china.cmd"

if (-not (Test-Path $artifactsDir)) {
    New-Item -ItemType Directory -Path $artifactsDir | Out-Null
}

$askpassPath = Join-Path $artifactsDir "ssh-askpass.cmd"

Set-Content -LiteralPath $askpassPath -Value "@echo off`necho Docker!" -Encoding ASCII

$remoteConnectionCommand = "`"$azChinaPath`" webapp create-remote-connection --resource-group $ResourceGroup --name $AppName --subscription $SubscriptionId --timeout $TunnelTimeoutSeconds --port $TunnelPort --only-show-errors"
$tunnelProcess = $null

function Stop-TunnelProcess {
    if ($null -ne $tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-Process -Id $tunnelProcess.Id -Force
        $tunnelProcess.WaitForExit()
    }
}

try {
    $tunnelProcess = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList "/d /s /c $remoteConnectionCommand" `
        -WorkingDirectory "$repoRoot" `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds($PortWaitSeconds)

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 1

        try {
            $tcpReady = Test-NetConnection 127.0.0.1 -Port $TunnelPort -WarningAction SilentlyContinue
        } catch {
            $tcpReady = $null
        }

        if ($tcpReady -and $tcpReady.TcpTestSucceeded) {
            break
        }

        if ($tunnelProcess.HasExited) {
            break
        }
    }

    if ($tunnelProcess.HasExited) {
        throw "Azure App Service remote tunnel process exited before the SSH port opened."
    }

    $tcpFinal = Test-NetConnection 127.0.0.1 -Port $TunnelPort -WarningAction SilentlyContinue
    if (-not $tcpFinal.TcpTestSucceeded) {
        throw "Failed to establish Azure App Service remote tunnel for $AppName."
    }

    Start-Sleep -Seconds 5

    $previousAskPass = $env:SSH_ASKPASS
    $previousAskPassRequire = $env:SSH_ASKPASS_REQUIRE
    $previousDisplay = $env:DISPLAY

    try {
        $env:SSH_ASKPASS = $askpassPath
        $env:SSH_ASKPASS_REQUIRE = "force"
        $env:DISPLAY = "codex"

        & ssh.exe `
            -o StrictHostKeyChecking=no `
            -o UserKnownHostsFile=/dev/null `
            -o ConnectTimeout=60 `
            -m hmac-sha1 `
            -p $TunnelPort `
            root@127.0.0.1 `
            $Command

        exit $LASTEXITCODE
    }
    finally {
        if ($null -eq $previousAskPass) {
            Remove-Item Env:SSH_ASKPASS -ErrorAction SilentlyContinue
        } else {
            $env:SSH_ASKPASS = $previousAskPass
        }

        if ($null -eq $previousAskPassRequire) {
            Remove-Item Env:SSH_ASKPASS_REQUIRE -ErrorAction SilentlyContinue
        } else {
            $env:SSH_ASKPASS_REQUIRE = $previousAskPassRequire
        }

        if ($null -eq $previousDisplay) {
            Remove-Item Env:DISPLAY -ErrorAction SilentlyContinue
        } else {
            $env:DISPLAY = $previousDisplay
        }
    }
}
finally {
    Stop-TunnelProcess
}
