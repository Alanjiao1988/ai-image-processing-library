# AGENTS.md

## Project Name
AI 图片处理与图片库

## Mission
构建一套可运行、可部署、可扩展的企业级 Web 应用，提供三类 AI 图片能力与一套图片资产管理能力：

1. 文生图
2. 图片编辑
3. 以图生图
4. 图片库管理

系统默认进入“AI 图片处理”页面。  
页面左上角显示“应用健康状态”，右上角显示“图片库”入口。

本项目的目标不是单纯做一个生图 Demo，而是做成一个具备生产可扩展性的全栈应用。

---

## High-Level Product Requirements

### Core Modules
系统包含两个核心模块：

#### 1. AI 图片处理
包含三个子页签：
- 文生图
- 图片编辑
- 以图生图

#### 2. 图片库
支持：
- 创建文件夹
- 查看文件夹列表
- 进入文件夹查看图片
- 图片预览
- 将 AI 生成结果保存到指定文件夹

### Global Layout
- 左上角：应用健康状态
- 主区域：当前页面
- 右上角：图片库入口
- 默认首页：AI 图片处理
- 默认子页签：文生图

---

## Cloud and Deployment Constraints

### Deployment Environment
应用主体资源部署在**世纪互联 Azure**。

### Important Constraint
世纪互联 Azure 不要求原生提供 `gpt-image-1.5`。  
本项目允许通过**外部模型 API**接入图片能力。

### Hard Rule
前端**绝不能**直接持有或调用外部模型 API Key。  
所有图片模型调用必须经过后端。  
后端优先通过 **Azure API Management（APIM）** 统一访问 AI 能力端点。

### Current AI Integration Strategy
产品层固定保留三种模式：
- 文生图
- 图片编辑
- 以图生图

模型层不要强绑定为“三种模式必然对应三条完全不同的底层 API”。  
后端必须使用 provider adapter / gateway adapter 抽象来隔离这一差异。

---

## Preferred Architecture

### Frontend
- React
- TypeScript
- Vite

### Backend
- Node.js
- TypeScript
- Express

### Database
- PostgreSQL
- Prisma ORM

### Storage
- Azure Blob Storage

### API Gateway
- Azure API Management（APIM）

### Monitoring
- Azure Monitor / Application Insights

---

## Repository Structure Expectations

推荐目录结构如下。若实现时略有调整，可以接受，但必须保持清晰分层。

```text
/
├─ AGENTS.md
├─ README.md
├─ .env.example
├─ docs/
│  ├─ product-spec.md
│  ├─ api-spec.md
│  └─ deployment.md
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  ├─ shared/
│  ├─ config/
│  └─ ui/
├─ prisma/
│  └─ schema.prisma
└─ scripts/
```
