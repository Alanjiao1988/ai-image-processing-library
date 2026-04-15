# Product Spec

## 产品名称
AI 图片处理与图片库

## 当前阶段目标
第一阶段仅实现“结构完整、可启动、可继续迭代”的全栈骨架，不在本阶段强行接通所有高级业务逻辑。

## 核心页面

### 1. AI 图片处理
- 默认首页
- 默认打开“文生图”
- 包含三个页签：
  - 文生图
  - 图片编辑
  - 以图生图

### 2. 图片库
- 查看文件夹列表
- 创建文件夹
- 进入文件夹查看图片
- 图片预览
- 为下一阶段“保存生成结果到图片库”预留入口

## 全局布局
- 左上角显示“应用健康状态”
- 右上角显示“图片库”入口
- 主区域显示当前页面

## 技术约束
- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + Express
- 数据库：PostgreSQL + Prisma
- 存储：Azure Blob Storage
- 图片模型：通过外部 GPT-image-1.5 / APIM 接入
- 敏感配置全部通过环境变量注入

## 本阶段交付
- Monorepo 项目骨架
- 前后端基础目录结构
- Prisma schema
- REST API 骨架
- 健康检查接口骨架
- Blob Storage 服务封装骨架
- Provider Adapter 骨架
- 前端基础页面与布局
