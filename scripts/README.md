# scripts

Azure China 部署脚本、数据库初始化脚本与运维辅助脚本。

## APIM OpenAI Image Gateway

### 部署

```powershell
# 一键部署（Foundry + APIM）
.\deploy-apim.ps1 -Phase all `
    -ApimName "<apim-name>" `
    -GlobalSubscription "<global-sub>" `
    -GlobalResourceGroup "<global-rg>" `
    -OpenAiName "<openai-name>"

# 仅部署 APIM（已有 Foundry）
.\deploy-apim.ps1 -Phase apim `
    -ApimName "<apim-name>" `
    -FoundryEndpoint "https://xxx.openai.azure.com" `
    -FoundryKey "<key>"
```

### 验证

```powershell
.\test-apim.ps1 -GatewayBaseUrl "https://<apim>.azure-api.cn/v1" -BearerToken "<token>"
```

### 目录结构

```
scripts/
├── deploy-apim.ps1              # 部署编排脚本
├── test-apim.ps1                # 验证脚本
├── iac/
│   ├── main.bicep               # APIM API + Named Values + Backend
│   ├── main.parameters.json
│   ├── foundry.bicep            # Azure OpenAI + gpt-image-1.5
│   └── foundry.parameters.json
└── policies/
    ├── api-shared.xml           # 共享策略：认证、限流、错误归一化
    ├── op-generations.xml       # 文生图路由 + 响应归一化
    ├── op-edits.xml             # 图片编辑路由 + 响应归一化
    ├── op-variations.xml        # 以图生图路由 + 响应归一化
    └── op-health.xml            # 网关健康检查
```
