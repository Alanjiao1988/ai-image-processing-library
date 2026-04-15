# Deployment Notes

## Azure China Defaults
- Subscription: `1f587540-6ec9-414c-a0d0-0e792ed8ed63`
- Resource Group: `image`
- Location: `chinanorth3`

## Suggested Resources
- App Service / Container Apps for `apps/api`
- Static Web Apps / App Service for `apps/web`
- Azure Database for PostgreSQL Flexible Server
- Azure Storage Account with Blob containers:
  - `uploads-temp`
  - `generated-temp`
  - `library-original`
  - `library-thumb`
- Azure API Management for external image provider gateway
- Application Insights / Azure Monitor

## APIM OpenAI Image Gateway

The APIM gateway exposes OpenAI-style image APIs (`/v1/images/...`) on an **existing** APIM instance in Azure China, forwarding to an Azure OpenAI (Foundry) `gpt-image-1.5` deployment on Azure Global.

### Architecture

```
Client → Azure China APIM (/v1/images/...) → Azure Global Foundry (gpt-image-1.5)
```

- APIM handles: Bearer auth, rate limiting, request ID, error normalization
- Foundry handles: actual image generation/editing
- Existing APIM APIs are NOT modified

### Deployment Steps

#### 1. Provision Foundry (Azure Global)

```powershell
# From Zhenjiang-image repo root
.\scripts\deploy-apim.ps1 -Phase foundry `
    -GlobalSubscription "<your-global-sub-id>" `
    -GlobalResourceGroup "<rg-name>" `
    -OpenAiName "<openai-resource-name>"
```

Or use an existing Foundry endpoint by passing `-FoundryEndpoint` and `-FoundryKey` directly.

#### 2. Deploy APIM API (Azure China)

```powershell
.\scripts\deploy-apim.ps1 -Phase apim `
    -ApimName "<existing-apim-name>" `
    -FoundryEndpoint "https://xxx.openai.azure.com" `
    -FoundryKey "<foundry-api-key>"
```

#### 3. Deploy All at Once

```powershell
.\scripts\deploy-apim.ps1 -Phase all `
    -ApimName "<existing-apim-name>" `
    -GlobalSubscription "<global-sub>" `
    -GlobalResourceGroup "<global-rg>" `
    -OpenAiName "<openai-name>"
```

#### 4. Validate

```powershell
.\scripts\test-apim.ps1 `
    -GatewayBaseUrl "https://<apim>.azure-api.cn/v1" `
    -BearerToken "<token>" `
    -SkipImageGeneration
```

### APIM Named Values

| Named Value | Secret | Description |
|---|---|---|
| `openai-images-foundry-endpoint` | No | Foundry base URL |
| `openai-images-foundry-key` | Yes | Foundry API key |
| `openai-images-deployment-name` | No | e.g. `gpt-image-1.5` |
| `openai-images-api-version` | No | e.g. `2025-04-01-preview` |
| `openai-images-gateway-token` | Yes | Bearer token for callers |
| `openai-images-rate-limit` | No | Calls/min/IP (default 30) |
| `openai-images-timeout` | No | Backend timeout seconds (default 120) |

### IaC Files

```
scripts/
├── deploy-apim.ps1              # Deployment orchestrator
├── test-apim.ps1                # Validation script
├── iac/
│   ├── main.bicep               # APIM API, operations, policies, named values
│   ├── main.parameters.json     # Template parameter file
│   ├── foundry.bicep            # Azure OpenAI resource + deployment
│   └── foundry.parameters.json  # Template parameter file
└── policies/
    ├── api-shared.xml           # Shared: auth, rate limit, error normalization
    ├── op-generations.xml       # POST /images/generations routing + response
    ├── op-edits.xml             # POST /images/edits routing + response
    ├── op-variations.xml        # POST /images/variations routing + response
    └── op-health.xml            # GET /health (gateway health check)
```
