# 图片 API 接入模板

本文档用于说明如何把外部图片能力接入本项目。示例中的地址、密钥和部署名称均为占位值，请在实际部署时通过安全渠道注入，不要提交到代码仓库。

## 基本信息

| 项目 | 值 |
|------|-----|
| Base URL | `https://your-apim-or-provider.example.com/v1` |
| API Key | `__REPLACE_WITH_RUNTIME_SECRET__` |
| 认证方式 | HTTP Header `api-key: <key>` |
| 备用 Key | `__REPLACE_WITH_RUNTIME_SECRET__` |

---

## Python SDK 初始化

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-apim-or-provider.example.com/v1",
    api_key="__REPLACE_WITH_RUNTIME_SECRET__",
)
```

或通过环境变量：

```bash
OPENAI_BASE_URL=https://your-apim-or-provider.example.com/v1
OPENAI_API_KEY=__REPLACE_WITH_RUNTIME_SECRET__
```

---

## 接口 1：文生图 — POST /v1/images/generations

根据文字描述生成图片，`Content-Type: application/json`。

```bash
curl -X POST "https://your-apim-or-provider.example.com/v1/images/generations" \
  -H "api-key: __REPLACE_WITH_RUNTIME_SECRET__" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只穿着宇航服的猫咪在月球上散步",
    "size": "1024x1024",
    "n": 1
  }'
```

---

## 接口 2：图片编辑 — POST /v1/images/edits

提供原图 + 文字描述，对图片进行编辑，`Content-Type: multipart/form-data`。

```bash
curl -X POST "https://your-apim-or-provider.example.com/v1/images/edits" \
  -H "api-key: __REPLACE_WITH_RUNTIME_SECRET__" \
  -F "image=@original.png" \
  -F "prompt=把背景换成沙滩和大海" \
  -F "size=1024x1024" \
  -F "n=1"
```

---

## 接口 3：图片变体 — POST /v1/images/variations

提供原图，生成风格相近的变体。是否要求 `prompt` 由具体 provider 决定，本项目适配层会优先透传提示词以兼容更严格的网关实现。

```bash
curl -X POST "https://your-apim-or-provider.example.com/v1/images/variations" \
  -H "api-key: __REPLACE_WITH_RUNTIME_SECRET__" \
  -F "image=@original.png" \
  -F "prompt=延续原图视觉语言，生成夜景版本" \
  -F "size=1024x1024" \
  -F "n=1"
```

---

## 健康检查

```bash
curl -H "api-key: __REPLACE_WITH_RUNTIME_SECRET__" \
  "https://your-apim-or-provider.example.com/v1/health"
```

---

## 接入注意事项

- 所有真实密钥都必须通过环境变量或密钥管理服务注入
- 不要把测试 URL、订阅专用 APIM 名称、密钥或令牌提交到 GitHub
- `IMAGE_API_BASE_URL` 可以配置为根路径，也可以配置为已经包含 `/v1` 的地址；后端适配层会自动去重
- 图片编辑和以图生图都统一走后端代理，不允许前端直连外部模型
