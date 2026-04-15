# AI 图片处理与图片库

企业内部使用的 AI 图片应用，包含“AI 图片处理”和“图片库”两大能力，默认首页为 AI 图片处理，默认页签为文生图。当前仓库已完成首个可验收版本，三种生成模式和图片库保存闭环均已打通。

## 当前里程碑范围

- 前端基础布局与页面框架
- 文生图、图片编辑、以图生图任务创建、轮询和结果预览
- 生成结果保存到图片库指定文件夹
- 后端 REST API 与 GenerationJob 状态流转
- Prisma 数据模型
- Azure Blob Storage 服务封装，覆盖 `uploads-temp`、`generated-temp`、`library-original`
- GPT-image Provider Adapter，支持文生图、编辑、变体三种调用
- 健康状态接口与前端健康卡片
- 文件夹管理、图片列表、图片详情预览

本轮暂未实现：

- 真正的缩略图压缩生成（当前列表缩略图复用原图 URL）
- 24 小时临时文件自动清理任务
- 生产级队列与异步工作器拆分

已实现（APIM 网关）：

- Azure APIM OpenAI-style 图片网关（`/v1/images/generations`、`/v1/images/edits`、`/v1/images/variations`、`/v1/health`）
- Bearer token 认证、速率限制、请求 ID 注入、错误归一化
- Bicep IaC 模板（`scripts/iac/`）与 APIM policy XML（`scripts/policies/`）
- Azure Global Foundry gpt-image-1.5 部署模板
- 部署脚本与验证脚本

## 技术栈

- 前端：React + TypeScript + Vite + Material UI
- 后端：Node.js + TypeScript + Express
- ORM：Prisma
- 数据库：PostgreSQL
- 文件存储：Azure Blob Storage
- 任务机制：REST + Job 轮询
- 监控预留：Azure Application Insights / Azure Monitor

## 部署约束

- Azure China 订阅固定为 `1f587540-6ec9-414c-a0d0-0e792ed8ed63`
- 默认资源组名称：`image`
- 默认区域：`chinanorth3`
- 外部图片模型通过后端环境变量注入，前端绝不暴露模型 `base URL` 或 `API key`
- 后端优先通过 APIM 网关访问外部图片模型

## 项目结构

```text
.
├─ AGENTS.md
├─ docs
│  ├─ product-spec.md
│  ├─ api-spec.md
│  └─ deployment.md
├─ apps
│  ├─ api                  # Express + Prisma + Blob + Provider Adapter
│  └─ web                  # React + Vite + Material UI
├─ packages                # 预留共享类型、配置、UI 组件扩展位
├─ docker-compose.local.yml
├─ .env.example
├─ az-china.cmd            # 隔离的 Azure China CLI 入口
└─ README.md
```

## 本地开发

1. 复制 `.env.example` 为 `.env`，并补全图片模型、APIM 网关和 Azure Blob 参数。
   关键变量包括：
   - `IMAGE_API_BASE_URL`：外部 GPT-image / APIM 网关地址，可配置为根路径或带 `/v1` 前缀的地址
   - `IMAGE_API_KEY`：后端调用外部模型的密钥
   - `IMAGE_GENERATE_PATH`：文生图接口路径
   - `IMAGE_EDIT_PATH`：图片编辑接口路径
   - `IMAGE_VARIATION_PATH`：以图生图接口路径
   - `IMAGE_RESPONSE_FORMAT`：默认 `b64_json`
   - `VITE_JOB_POLL_INTERVAL_MS`：前端任务轮询间隔，默认 `3000`
2. 如需本地依赖，可先启动 PostgreSQL 与 Azurite：

```powershell
docker compose -f docker-compose.local.yml up -d
```

3. 安装依赖：

```powershell
npm install
```

4. 生成 Prisma Client 并执行迁移：

```powershell
npm run db:generate
npm run db:migrate
```

5. 启动前后端：

```powershell
npm run dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

首次启动建议先验证：

- `GET http://localhost:3001/api/health/summary`
- `GET http://localhost:3001/api/library/folders`

## 文档入口

- [AGENTS.md](./AGENTS.md)
- [docs/product-spec.md](./docs/product-spec.md)
- [docs/api-spec.md](./docs/api-spec.md)
- [docs/deployment.md](./docs/deployment.md)

## Azure China 部署建议

推荐部署形态：

- 前端：Azure Static Web Apps 或 App Service / Container Apps
- 后端：Azure App Service 或 Azure Container Apps
- 数据库：Azure Database for PostgreSQL Flexible Server
- 存储：Azure Storage Account + Blob Containers
- API Gateway：Azure API Management
- 监控：Application Insights + Azure Monitor

建议先使用当前仓库中的隔离 CLI：

```powershell
.\az-china.cmd account show
```

确认订阅仍为 `1f587540-6ec9-414c-a0d0-0e792ed8ed63` 后，再进行资源创建。

资源组与区域示例：

```powershell
.\az-china.cmd group create --name image --location chinanorth3
```

## 运行能力说明

- 文生图、图片编辑、以图生图都采用数据库持久化与前端轮询方式
- 上传型任务会先把输入图片写入 `uploads-temp`
- 生成成功后结果先写入 `generated-temp`，用户点击“保存到图片库”后再正式写入 `library-original`
- 图片库默认单层文件夹，文件夹名称不可重复，列表按创建时间倒序
- 图片详情展示来源模式、提示词、尺寸、文件大小、生成时间等元数据
- 健康状态每 60 秒自动刷新，并支持详情展开

## 验收测试

当前仓库附带两类验收脚本：

- `scripts/run-acceptance.ps1`
  说明：直接对已部署的前后端公网地址执行端到端验收
- `scripts/run-cloud-step.ps1`
  说明：通过 Azure China App Service 的 Kudu 命令接口，在云内分步骤执行验收，更适合排除本地网络差异

本次在 Azure China 云内已验证通过的场景：

- 前端站点可打开，默认进入 AI 图片处理
- 健康检查接口返回正常
- 文生图生成成功，并可保存到图片库
- 图片编辑生成成功，并可保存到图片库
- 以图生图生成成功，并可保存到图片库
- 图片库文件夹中可看到 3 张测试图片，来源模式分别为 `TEXT_TO_IMAGE`、`IMAGE_EDIT`、`IMAGE_VARIATION`

当前推荐体验入口（Azure China Application Gateway）：

- 域名：`http://image-m21426-cn3-20260415.chinanorth3.cloudapp.chinacloudapi.cn`
- 公网 IP：`http://163.228.243.155`

说明：

- 入口层采用付费 `Standard_v2` Application Gateway，路径路由策略为：
- `/api/*` 直连 API App Service，避免上传请求经过前端代理导致的 502。
- 其他路径转发到 Web App Service。

## 故障排查（卡在 PROCESSING）

如果任务长时间停在 `PROCESSING`，优先检查以下三项：

1. 外部模型限流/超时：确认 APIM 或模型端是否持续 `429`，以及 `retry-after` 是否过长。
2. 任务兜底是否开启：后端已加入任务级执行超时与“陈旧 PROCESSING 自动置为 FAILED”机制。
3. 入口路由是否正确：确保网关路径路由为 `/api/* -> API`，避免上传型请求走前端反向代理。

相关脚本：

- `scripts/deploy-ingress.ps1`：创建/更新 Application Gateway 公网入口
- `scripts/deploy-web-only.ps1`：仅部署前端
- `scripts/deploy-api-only.ps1`：仅部署后端
- `scripts/hotfix-api-runtime-files.ps1`：快速热更新后端已编译运行时文件

## 后续扩展方向

- 增加真正的缩略图生成、临时文件清理和存储配额统计优化
- 将后台任务迁移到队列化执行，例如 Azure Queue / Service Bus
- 增加 RBAC、审计日志、多租户隔离
