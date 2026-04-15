# API Spec

## APIM Gateway — OpenAI-style Image API (`/v1`)

All image endpoints are exposed through Azure APIM as an isolated API group (`openai-images-v1`).
Authentication uses Bearer token (NOT subscription key).

### Authentication

All requests must include:
```
Authorization: Bearer {GATEWAY_TOKEN}
```

Requests carrying `Ocp-Apim-Subscription-Key` header or `subscription-key` query param are rejected with `401 UNAUTHORIZED`.

### Common Response Envelope

**Success:**
```json
{
  "success": true,
  "request_id": "uuid",
  "provider": "azure-foundry",
  "mode": "text_to_image | image_edit | image_variation",
  "created": 1700000000,
  "images": [
    {
      "b64_json": "...",
      "mime_type": "image/png",
      "revised_prompt": "..."
    }
  ]
}
```

**Error:**
```json
{
  "success": false,
  "request_id": "uuid",
  "error": {
    "code": "INVALID_REQUEST | UNAUTHORIZED | FORBIDDEN | RATE_LIMITED | CONTENT_FILTERED | UPSTREAM_ERROR | UPSTREAM_TIMEOUT | INTERNAL_ERROR",
    "message": "Human-readable message"
  }
}
```

### Endpoints

#### `POST /v1/images/generations`

Generate images from a text prompt.

**Content-Type:** `application/json`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | Yes | — | Text description of desired image |
| `n` | integer | No | 1 | Number of images (1-4) |
| `size` | string | No | `1024x1024` | `1024x1024`, `1024x1536`, `1536x1024` |
| `quality` | string | No | `auto` | `low`, `medium`, `high`, `auto` |
| `response_format` | string | No | `b64_json` | `b64_json` only (URL not supported through gateway) |

#### `POST /v1/images/edits`

Edit an existing image with a text prompt.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | PNG/JPEG to edit (max 20MB) |
| `prompt` | string | Yes | Edit instruction |
| `n` | integer | No | Number of edits |
| `size` | string | No | Output size |

#### `POST /v1/images/variations`

Create a variation of an existing image. Exposed as a separate endpoint but internally routes to the Foundry edits API.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | file | Yes | Reference image (max 20MB) |
| `prompt` | string | Yes | Variation instruction |
| `n` | integer | No | Number of variations |
| `size` | string | No | Output size |

#### `GET /v1/health`

Gateway health check.

**Response:**
```json
{
  "success": true,
  "request_id": "uuid",
  "service": "ai-gateway",
  "status": "healthy | degraded",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "dependencies": {
    "apim": { "status": "healthy" },
    "foundry": {
      "status": "healthy | unreachable",
      "deployment": "gpt-image-1.5"
    }
  }
}
```

### Error Code Mapping

| HTTP Status | Error Code | Trigger |
|-------------|-----------|---------|
| 400 | `INVALID_REQUEST` | Malformed request or missing fields |
| 401 | `UNAUTHORIZED` | Missing/invalid Bearer token |
| 403 | `FORBIDDEN` | Token valid but insufficient permissions |
| 429 | `RATE_LIMITED` | Exceeded rate limit (30 req/min/IP default) |
| 400 | `CONTENT_FILTERED` | Azure content safety filter triggered |
| 502 | `UPSTREAM_ERROR` | Foundry returned 5xx |
| 504 | `UPSTREAM_TIMEOUT` | Foundry didn't respond within timeout |
| 500 | `INTERNAL_ERROR` | Unexpected gateway error |

### Rate Limiting

- Default: 30 requests per minute per caller IP
- Configurable via APIM Named Value `openai-images-rate-limit`

### Timeout

- Default: 120 seconds backend timeout
- Image generation can be slow; callers should allow up to 180s total

---

## Internal Backend API (Express)

> These endpoints are used by the frontend application and are NOT exposed through APIM.

### Health
- `GET /api/health/summary`
- `GET /api/health/detail`
- `POST /api/health/frontend-ping`

### Image Jobs
- `POST /api/image/text-to-image`
- `POST /api/image/edit`
- `POST /api/image/variation`
- `GET /api/jobs/:jobId`

### Library
- `GET /api/library/folders`
- `POST /api/library/folders`
- `GET /api/library/folders/:folderId`
- `GET /api/library/folders/:folderId/images`
- `GET /api/library/images/:imageId`
- `POST /api/library/save-generated`

### Blob Proxy
- `GET /api/files/:container?path=...`
