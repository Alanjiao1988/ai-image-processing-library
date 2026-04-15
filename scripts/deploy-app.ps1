param(
    [string]$ResourceGroup = "image",
    [string]$Location = "chinanorth3",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [string]$Suffix,
    [string]$PostgresAdminUser = "aiimageadmin",
    [string]$PostgresAdminPassword,
    [string]$ImageApiBaseUrl,
    [string]$ImageApiKey,
    [string]$ImageGeneratePath = "/v1/images/generations",
    [string]$ImageEditPath = "/v1/images/edits",
    [string]$ImageVariationPath = "/v1/images/variations"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"

function Invoke-AzChina {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandText,
        [switch]$AllowFailure
    )

    $effectiveCommandText = if ($CommandText -match "(^|\s)--only-show-errors(\s|$)") {
        $CommandText
    } else {
        "$CommandText --only-show-errors"
    }

    $output = & cmd.exe /d /s /c "`"$azChinaPath`" $effectiveCommandText" 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        if ($AllowFailure) {
            return $null
        }

        throw "Azure CLI command failed: $CommandText"
    }

    if ($null -eq $output) {
        return $null
    }

    if ($output -is [System.Array]) {
        return (($output | ForEach-Object { "$_" }) -join [Environment]::NewLine)
    }

    return "$output"
}

function New-RandomSuffix {
    -join ((97..122) + (48..57) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
}

function New-PostgresPassword {
    $upper = -join (65..90 | Get-Random -Count 2 | ForEach-Object { [char]$_ })
    $lower = -join (97..122 | Get-Random -Count 4 | ForEach-Object { [char]$_ })
    $digits = -join (48..57 | Get-Random -Count 4 | ForEach-Object { [char]$_ })
    "ImgApp_${upper}${lower}${digits}"
}

function ConvertTo-AzAppSettings {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Settings
    )

    return ($Settings.GetEnumerator() |
        Sort-Object Key |
        ForEach-Object {
            '"' + "$($_.Key)=$($_.Value)" + '"'
        }) -join " "
}

function New-ZipArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    if (Test-Path $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Force
    }

    Compress-Archive -Path (Join-Path $SourcePath "*") -DestinationPath $DestinationPath -Force
}

function Build-ApiArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArtifactRoot
    )

    $deployPath = Join-Path $ArtifactRoot "api"
    if (Test-Path $deployPath) {
        Remove-Item -LiteralPath $deployPath -Recurse -Force
    }

    New-Item -ItemType Directory -Path $deployPath | Out-Null

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

    return $deployPath
}

function Build-WebArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArtifactRoot
    )

    $deployPath = Join-Path $ArtifactRoot "web"
    if (Test-Path $deployPath) {
        Remove-Item -LiteralPath $deployPath -Recurse -Force
    }

    New-Item -ItemType Directory -Path $deployPath | Out-Null

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

    return $deployPath
}

Push-Location $repoRoot

try {
    $subscriptionArg = "--subscription $SubscriptionId"

    $account = Invoke-AzChina "account show --query ""{subscription:id,name:name}"" -o json" | ConvertFrom-Json
    if ($account.subscription -ne $SubscriptionId) {
        throw "Azure China subscription mismatch. Expected $SubscriptionId, got $($account.subscription)."
    }

    Invoke-AzChina "account set --subscription $SubscriptionId" | Out-Null

    $groupExists = (Invoke-AzChina "group exists --name $ResourceGroup $subscriptionArg").Trim()
    if ($groupExists -ne "true") {
        Invoke-AzChina "group create --name $ResourceGroup --location $Location $subscriptionArg -o json" | Out-Null
    }

    foreach ($providerNamespace in @(
        "Microsoft.Storage",
        "Microsoft.Web",
        "Microsoft.DBforPostgreSQL",
        "Microsoft.OperationalInsights",
        "Microsoft.Insights"
    )) {
        Invoke-AzChina "provider register --namespace $providerNamespace $subscriptionArg --wait" | Out-Null
    }

    if (-not $Suffix) {
        $existingStorageName = (Invoke-AzChina "storage account list --resource-group $ResourceGroup $subscriptionArg --query ""[?starts_with(name, 'imgappst')].name | [0]"" -o tsv").Trim()
        if ($existingStorageName) {
            $Suffix = $existingStorageName.Substring("imgappst".Length)
        } else {
            $Suffix = New-RandomSuffix
        }
    }

    if (-not $PostgresAdminPassword) {
        $PostgresAdminPassword = New-PostgresPassword
    }

    $storageName = ("imgappst" + $Suffix).ToLower()
    $postgresServerName = ("image-pg-" + $Suffix).ToLower()
    $postgresDbName = "aiimageapp"
    $planName = ("image-plan-" + $Suffix).ToLower()
    $apiAppName = ("image-api-" + $Suffix).ToLower()
    $webAppName = ("image-web-" + $Suffix).ToLower()
    $workspaceName = ("image-logs-" + $Suffix).ToLower()

    Write-Host "Using suffix: $Suffix"
    Write-Host "Using resource group: $ResourceGroup"
    Write-Host "Storage account: $storageName"
    Write-Host "PostgreSQL server: $postgresServerName"
    Write-Host "App Service plan: $planName"
    Write-Host "API app: $apiAppName"
    Write-Host "Web app: $webAppName"

    $storageAccount = Invoke-AzChina "storage account show --name $storageName --resource-group $ResourceGroup $subscriptionArg -o json" -AllowFailure
    if (-not $storageAccount) {
        Invoke-AzChina "storage account create --name $storageName --resource-group $ResourceGroup --location $Location --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --min-tls-version TLS1_2 $subscriptionArg -o json" | Out-Null
    }

    $storageKey = (Invoke-AzChina "storage account keys list --resource-group $ResourceGroup --account-name $storageName $subscriptionArg --query ""[0].value"" -o tsv").Trim()
    $storageConnectionString = (Invoke-AzChina "storage account show-connection-string --name $storageName --resource-group $ResourceGroup $subscriptionArg --query ""connectionString"" -o tsv").Trim()

    foreach ($container in @("uploads-temp", "generated-temp", "library-original", "library-thumb")) {
        Invoke-AzChina "storage container create --name $container --account-name $storageName --account-key $storageKey --public-access off -o none" | Out-Null
    }

    $postgresServer = Invoke-AzChina "postgres flexible-server show --resource-group $ResourceGroup --name $postgresServerName $subscriptionArg -o json" -AllowFailure
    if (-not $postgresServer) {
        Invoke-AzChina "postgres flexible-server create --resource-group $ResourceGroup --name $postgresServerName --location $Location --admin-user $PostgresAdminUser --admin-password $PostgresAdminPassword --sku-name Standard_D2s_v3 --tier GeneralPurpose --storage-size 128 --version 15 --public-access 0.0.0.0 $subscriptionArg --yes -o json" | Out-Null
    } else {
        Invoke-AzChina "postgres flexible-server update --resource-group $ResourceGroup --name $postgresServerName --admin-password $PostgresAdminPassword $subscriptionArg --yes -o json" | Out-Null
        Invoke-AzChina "postgres flexible-server update --resource-group $ResourceGroup --name $postgresServerName --public-access Enabled $subscriptionArg --yes -o json" | Out-Null
    }

    $azureServicesFirewallRuleOutput = Invoke-AzChina "postgres flexible-server firewall-rule list --resource-group $ResourceGroup --name $postgresServerName $subscriptionArg --query ""[?name=='allowazureservices'].name | [0]"" -o tsv"
    $azureServicesFirewallRule = if ($null -eq $azureServicesFirewallRuleOutput) {
        ""
    } else {
        $azureServicesFirewallRuleOutput.Trim()
    }
    if (-not $azureServicesFirewallRule) {
        Invoke-AzChina "postgres flexible-server firewall-rule create --resource-group $ResourceGroup --name $postgresServerName --rule-name allowazureservices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 $subscriptionArg -o none" | Out-Null
    }

    $databaseExists = (Invoke-AzChina "postgres flexible-server db list --resource-group $ResourceGroup --server-name $postgresServerName $subscriptionArg --query ""[?name=='$postgresDbName'].name | [0]"" -o tsv").Trim()
    if (-not $databaseExists) {
        Invoke-AzChina "postgres flexible-server db create --resource-group $ResourceGroup --server-name $postgresServerName --database-name $postgresDbName $subscriptionArg -o json" | Out-Null
    }

    $postgresHost = (Invoke-AzChina "postgres flexible-server show --resource-group $ResourceGroup --name $postgresServerName $subscriptionArg --query ""fullyQualifiedDomainName"" -o tsv").Trim()
    $databaseUrl = "postgresql://${PostgresAdminUser}:${PostgresAdminPassword}@${postgresHost}:5432/${postgresDbName}?schema=public&sslmode=require"

    $workspace = Invoke-AzChina "monitor log-analytics workspace show --resource-group $ResourceGroup --workspace-name $workspaceName $subscriptionArg -o json" -AllowFailure
    if (-not $workspace) {
        Invoke-AzChina "monitor log-analytics workspace create --resource-group $ResourceGroup --workspace-name $workspaceName --location $Location --sku PerGB2018 --retention-time 30 $subscriptionArg -o json" | Out-Null
    }

    $plan = Invoke-AzChina "appservice plan show --resource-group $ResourceGroup --name $planName $subscriptionArg -o json" -AllowFailure
    if (-not $plan) {
        Invoke-AzChina "appservice plan create --name $planName --resource-group $ResourceGroup --location $Location --sku S1 --is-linux $subscriptionArg -o json" | Out-Null
    }

    $apiApp = Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $apiAppName $subscriptionArg -o json" -AllowFailure
    if (-not $apiApp) {
        Invoke-AzChina "webapp create --resource-group $ResourceGroup --plan $planName --name $apiAppName --runtime ""NODE:22-lts"" --https-only true $subscriptionArg -o json" | Out-Null
    }

    $webApp = Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $webAppName $subscriptionArg -o json" -AllowFailure
    if (-not $webApp) {
        Invoke-AzChina "webapp create --resource-group $ResourceGroup --plan $planName --name $webAppName --runtime ""NODE:22-lts"" --https-only true $subscriptionArg -o json" | Out-Null
    }

    $apiHostName = (Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $apiAppName $subscriptionArg --query ""defaultHostName"" -o tsv").Trim()
    $webHostName = (Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $webAppName $subscriptionArg --query ""defaultHostName"" -o tsv").Trim()
    $apiBaseUrl = "https://${apiHostName}"
    $webBaseUrl = "https://${webHostName}"

    $apiSettings = @{
        APPLICATIONINSIGHTS_CONNECTION_STRING = ""
        AZURE_CHINA_SUBSCRIPTION_ID = $SubscriptionId
        AZURE_LOCATION = $Location
        AZURE_RESOURCE_GROUP = $ResourceGroup
        AZURE_STORAGE_CONNECTION_STRING = $storageConnectionString
        CORS_ORIGIN = $webBaseUrl
        DATABASE_URL = $databaseUrl
        ENABLE_ORYX_BUILD = "false"
        HEALTH_FRONTEND_STALE_MS = "120000"
        HEALTH_REFRESH_INTERVAL_MS = "60000"
        IMAGE_EDIT_PATH = $ImageEditPath
        IMAGE_GENERATE_PATH = $ImageGeneratePath
        IMAGE_MAX_RETRY = "2"
        IMAGE_MODEL_NAME = "gpt-image-1.5"
        IMAGE_PROVIDER = "gpt-image"
        IMAGE_RESPONSE_FORMAT = "b64_json"
        IMAGE_TIMEOUT_MS = "120000"
        IMAGE_VARIATION_PATH = $ImageVariationPath
        JOB_CLEANUP_INTERVAL_MINUTES = "60"
        MAX_UPLOAD_SIZE_MB = "20"
        NODE_ENV = "production"
        PORT = "8080"
        SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
        STORAGE_CAPACITY_BYTES = "536870912000"
        TEMP_RETENTION_HOURS = "24"
    }

    if ($ImageApiBaseUrl) {
        $apiSettings["IMAGE_API_BASE_URL"] = $ImageApiBaseUrl
    }

    if ($ImageApiKey) {
        $apiSettings["IMAGE_API_KEY"] = $ImageApiKey
    }

    $webSettings = @{
        ENABLE_ORYX_BUILD = "false"
        NODE_ENV = "production"
        PORT = "8080"
        SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
    }

    Invoke-AzChina "webapp config appsettings set --resource-group $ResourceGroup --name $apiAppName $subscriptionArg --settings $(ConvertTo-AzAppSettings -Settings $apiSettings) -o none" | Out-Null
    Invoke-AzChina "webapp config appsettings set --resource-group $ResourceGroup --name $webAppName $subscriptionArg --settings $(ConvertTo-AzAppSettings -Settings $webSettings) -o none" | Out-Null

    Invoke-AzChina "webapp config set --resource-group $ResourceGroup --name $apiAppName $subscriptionArg --always-on true --http20-enabled true --ftps-state Disabled --min-tls-version 1.2 --startup-file ""node ./node_modules/prisma/build/index.js db push --schema prisma/schema.prisma --skip-generate && node dist/index.js"" -o none" | Out-Null
    Invoke-AzChina "webapp config set --resource-group $ResourceGroup --name $webAppName $subscriptionArg --always-on true --http20-enabled true --ftps-state Disabled --min-tls-version 1.2 --startup-file ""node server.js"" -o none" | Out-Null

    $buildArtifactRoot = Join-Path $repoRoot ".deployment-artifacts"
    if (Test-Path $buildArtifactRoot) {
        Remove-Item -LiteralPath $buildArtifactRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $buildArtifactRoot | Out-Null

    npm run build --workspace @ai-image-app/api
    if ($LASTEXITCODE -ne 0) {
        throw "API build failed."
    }

    $previousApiBaseUrl = $env:VITE_API_BASE_URL
    $env:VITE_API_BASE_URL = $apiBaseUrl
    try {
        npm run build --workspace @ai-image-app/web
        if ($LASTEXITCODE -ne 0) {
            throw "Web build failed."
        }
    } finally {
        if ($null -eq $previousApiBaseUrl) {
            Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
        } else {
            $env:VITE_API_BASE_URL = $previousApiBaseUrl
        }
    }

    $apiArtifactPath = Build-ApiArtifact -ArtifactRoot $buildArtifactRoot
    $webArtifactPath = Build-WebArtifact -ArtifactRoot $buildArtifactRoot

    $apiZipPath = Join-Path $buildArtifactRoot "api.zip"
    $webZipPath = Join-Path $buildArtifactRoot "web.zip"

    New-ZipArchive -SourcePath $apiArtifactPath -DestinationPath $apiZipPath
    New-ZipArchive -SourcePath $webArtifactPath -DestinationPath $webZipPath

    Invoke-AzChina "webapp deploy --resource-group $ResourceGroup --name $apiAppName --src-path ""$apiZipPath"" --type zip --clean true --restart true --track-status true --timeout 1800000 $subscriptionArg -o none" | Out-Null
    Invoke-AzChina "webapp deploy --resource-group $ResourceGroup --name $webAppName --src-path ""$webZipPath"" --type zip --clean true --restart true --track-status true --timeout 1800000 $subscriptionArg -o none" | Out-Null

    Invoke-AzChina "webapp restart --resource-group $ResourceGroup --name $apiAppName $subscriptionArg" | Out-Null
    Invoke-AzChina "webapp restart --resource-group $ResourceGroup --name $webAppName $subscriptionArg" | Out-Null

    Write-Host ""
    Write-Host "Deployment completed."
    Write-Host "Frontend URL: $webBaseUrl"
    Write-Host "API URL: $apiBaseUrl"
    Write-Host "Storage Account: $storageName"
    Write-Host "PostgreSQL Server: $postgresServerName"
    Write-Host "Log Analytics Workspace: $workspaceName"
}
finally {
    Pop-Location
}
