param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AzArgs
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$chinaConfigDir = if ($env:AZURE_CONFIG_DIR) { $env:AZURE_CONFIG_DIR } else { Join-Path $scriptDir ".azure-china" }

if (-not (Test-Path $chinaConfigDir)) {
    New-Item -ItemType Directory -Path $chinaConfigDir | Out-Null
}

$env:AZURE_CONFIG_DIR = $chinaConfigDir

$activeCloud = az cloud show --query name -o tsv 2>$null
if ($activeCloud -ne "AzureChinaCloud") {
    az cloud set --name AzureChinaCloud | Out-Null
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

az config set core.enable_broker_on_windows=false --only-show-errors 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if ($AzArgs.Count -eq 0) {
    az account show -o json
    exit $LASTEXITCODE
}

az @AzArgs
exit $LASTEXITCODE
