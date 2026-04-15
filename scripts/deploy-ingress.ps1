[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [string]$Location = "chinanorth3",
    [string]$GatewayName = "image-agw-m21426",
    [string]$PublicIpName = "image-agw-pip-m21426",
    [string]$DnsLabel = "image-m21426-cn3-20260415",
    [string]$VnetName = "image-agw-vnet-m21426",
    [string]$SubnetName = "appgw-subnet",
    [string]$VnetAddressPrefix = "10.42.0.0/16",
    [string]$SubnetAddressPrefix = "10.42.0.0/24",
    [string]$WebBackendHost = "image-web-m21426.chinacloudsites.cn",
    [string]$ApiBackendHost = "image-api-m21426.chinacloudsites.cn",
    [int]$Capacity = 2,
    [int]$MaxCapacity = 3
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"
$webProbeName = "webHttpsProbe"
$webHttpSettingsName = "appGatewayBackendHttpSettings"
$apiProbeName = "apiHttpsProbe"
$apiBackendPoolName = "apiBackendPool"
$apiHttpSettingsName = "apiBackendHttpsSettings"
$urlPathMapName = "appUrlPathMap"
$urlPathRuleName = "apiRoute"

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

function Test-AzureResourceExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandText
    )

    try {
        Invoke-AzChina $CommandText | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

Write-Host "Ensuring public IP..."
if (-not (Test-AzureResourceExists "network public-ip show --resource-group $ResourceGroup --subscription $SubscriptionId --name $PublicIpName -o json")) {
    Invoke-AzChina "network public-ip create --resource-group $ResourceGroup --subscription $SubscriptionId --location $Location --name $PublicIpName --sku Standard --allocation-method Static --dns-name $DnsLabel -o none" | Out-Null
}

Write-Host "Ensuring application gateway..."
if (-not (Test-AzureResourceExists "network application-gateway show --resource-group $ResourceGroup --subscription $SubscriptionId --name $GatewayName -o json")) {
    Invoke-AzChina "network application-gateway create --resource-group $ResourceGroup --subscription $SubscriptionId --location $Location --name $GatewayName --sku Standard_v2 --capacity $Capacity --max-capacity $MaxCapacity --priority 100 --public-ip-address $PublicIpName --vnet-name $VnetName --subnet $SubnetName --vnet-address-prefix $VnetAddressPrefix --subnet-address-prefix $SubnetAddressPrefix --frontend-port 80 --http-settings-port 443 --http-settings-protocol Https --servers $WebBackendHost -o none" | Out-Null
}

Write-Host "Ensuring HTTPS probe..."
if (-not (Test-AzureResourceExists "network application-gateway probe show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $webProbeName -o json")) {
    Invoke-AzChina "network application-gateway probe create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $webProbeName --protocol Https --host $WebBackendHost --path / --interval 30 --timeout 30 --threshold 3 --match-status-codes 200-399 -o none" | Out-Null
}

Write-Host "Updating web backend HTTP settings..."
Invoke-AzChina "network application-gateway http-settings update --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $webHttpSettingsName --protocol Https --port 443 --host-name $WebBackendHost --sni-name $WebBackendHost --probe $webProbeName --enable-probe true --timeout 120 -o none" | Out-Null

Write-Host "Ensuring API backend pool..."
if (-not (Test-AzureResourceExists "network application-gateway address-pool show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiBackendPoolName -o json")) {
    Invoke-AzChina "network application-gateway address-pool create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiBackendPoolName --servers $ApiBackendHost -o none" | Out-Null
}

Write-Host "Ensuring API HTTPS probe..."
if (-not (Test-AzureResourceExists "network application-gateway probe show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiProbeName -o json")) {
    Invoke-AzChina "network application-gateway probe create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiProbeName --protocol Https --host $ApiBackendHost --path /api/ping --interval 30 --timeout 30 --threshold 3 --match-status-codes 200-399 -o none" | Out-Null
}

Write-Host "Ensuring API backend HTTP settings..."
if (-not (Test-AzureResourceExists "network application-gateway http-settings show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiHttpSettingsName -o json")) {
    Invoke-AzChina "network application-gateway http-settings create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiHttpSettingsName --protocol Https --port 443 --host-name $ApiBackendHost --probe $apiProbeName --enable-probe true --timeout 120 --sni-name $ApiBackendHost -o none" | Out-Null
} else {
    Invoke-AzChina "network application-gateway http-settings update --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $apiHttpSettingsName --protocol Https --port 443 --host-name $ApiBackendHost --probe $apiProbeName --enable-probe true --timeout 120 --sni-name $ApiBackendHost -o none" | Out-Null
}

Write-Host "Ensuring URL path map..."
if (-not (Test-AzureResourceExists "network application-gateway url-path-map show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $urlPathMapName -o json")) {
    Invoke-AzChina "network application-gateway url-path-map create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name $urlPathMapName --default-address-pool appGatewayBackendPool --default-http-settings $webHttpSettingsName --rule-name $urlPathRuleName --paths /api/* --address-pool $apiBackendPoolName --http-settings $apiHttpSettingsName -o none" | Out-Null
} elseif (-not (Test-AzureResourceExists "network application-gateway url-path-map rule show --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --path-map-name $urlPathMapName --name $urlPathRuleName -o json")) {
    Invoke-AzChina "network application-gateway url-path-map rule create --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --path-map-name $urlPathMapName --name $urlPathRuleName --paths /api/* --address-pool $apiBackendPoolName --http-settings $apiHttpSettingsName -o none" | Out-Null
}

Write-Host "Switching request routing rule to path-based routing..."
Invoke-AzChina "network application-gateway rule update --resource-group $ResourceGroup --subscription $SubscriptionId --gateway-name $GatewayName --name rule1 --rule-type PathBasedRouting --http-listener appGatewayHttpListener --url-path-map $urlPathMapName --priority 100 -o none" | Out-Null

Write-Host "Collecting gateway endpoint..."
$publicIpJson = Invoke-AzChina "network public-ip show --resource-group $ResourceGroup --subscription $SubscriptionId --name $PublicIpName -o json" | ConvertFrom-Json
$backendHealthJson = Invoke-AzChina "network application-gateway show-backend-health --resource-group $ResourceGroup --subscription $SubscriptionId --name $GatewayName -o json" | ConvertFrom-Json

[pscustomobject]@{
    gatewayName = $GatewayName
    publicIpName = $PublicIpName
    publicIpAddress = $publicIpJson.ipAddress
    fqdn = $publicIpJson.dnsSettings.fqdn
    backendHealth = $backendHealthJson.backendAddressPools
} | ConvertTo-Json -Depth 10
