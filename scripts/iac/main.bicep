// main.bicep – Extends an existing APIM instance with an isolated OpenAI-style image API.
// Does NOT modify any existing APIs, products, or subscriptions on the APIM.

targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Name of the existing APIM instance in this resource group')
param apimName string

@description('Display name for the new API')
param apiDisplayName string = 'OpenAI Images v1'

@description('Azure OpenAI endpoint (e.g. https://xxx.openai.azure.com)')
param foundryEndpoint string

@description('Foundry deployment name for gpt-image-1.5')
param foundryDeploymentName string = 'gpt-image-1-5'

@description('Foundry API version')
param foundryApiVersion string = '2025-04-01-preview'

@description('Rate limit: max calls per minute per IP')
param rateLimitPerMinute int = 30

@description('Backend timeout in seconds (image generation can be slow)')
param backendTimeoutSeconds int = 120

// ─── Reference existing APIM ─────────────────────────────────────────────────

resource apim 'Microsoft.ApiManagement/service@2023-09-01-preview' existing = {
  name: apimName
}

// ─── Named Values (secrets) ──────────────────────────────────────────────────

resource nvFoundryEndpoint 'Microsoft.ApiManagement/service/namedValues@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-foundry-endpoint'
  properties: {
    displayName: 'openai-images-foundry-endpoint'
    value: foundryEndpoint
    secret: false
  }
}

resource nvDeploymentName 'Microsoft.ApiManagement/service/namedValues@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-deployment-name'
  properties: {
    displayName: 'openai-images-deployment-name'
    value: foundryDeploymentName
    secret: false
  }
}

resource nvApiVersion 'Microsoft.ApiManagement/service/namedValues@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-api-version'
  properties: {
    displayName: 'openai-images-api-version'
    value: foundryApiVersion
    secret: false
  }
}

resource nvRateLimit 'Microsoft.ApiManagement/service/namedValues@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-rate-limit'
  properties: {
    displayName: 'openai-images-rate-limit'
    value: string(rateLimitPerMinute)
    secret: false
  }
}

resource nvTimeout 'Microsoft.ApiManagement/service/namedValues@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-timeout'
  properties: {
    displayName: 'openai-images-timeout'
    value: string(backendTimeoutSeconds)
    secret: false
  }
}

// ─── Backend ─────────────────────────────────────────────────────────────────

resource backend 'Microsoft.ApiManagement/service/backends@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-foundry'
  properties: {
    title: 'Azure OpenAI Foundry (gpt-image-1.5)'
    description: 'Azure Global Foundry endpoint for image generation'
    url: foundryEndpoint
    protocol: 'http'
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
  }
}

// ─── API definition ──────────────────────────────────────────────────────────

resource api 'Microsoft.ApiManagement/service/apis@2023-09-01-preview' = {
  parent: apim
  name: 'openai-images-v1'
  properties: {
    displayName: apiDisplayName
    description: 'OpenAI-style image generation, editing and variation APIs backed by Azure AI Foundry gpt-image-1.5'
    path: 'v1'
    protocols: [ 'https' ]
    subscriptionRequired: true    // callers authenticate via APIM subscription key
    subscriptionKeyParameterNames: {
      header: 'api-key'
      query: 'api-key'
    }
    apiType: 'http'
    isCurrent: true
  }
}

// ─── API Policy (shared across all operations) ──────────────────────────────

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-09-01-preview' = {
  parent: api
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../policies/api-shared.xml')
  }
}

// ─── Operations ──────────────────────────────────────────────────────────────

resource opGenerations 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: api
  name: 'images-generations'
  properties: {
    displayName: 'Create image from text'
    method: 'POST'
    urlTemplate: '/images/generations'
    description: 'Generate images from a text prompt using gpt-image-1.5'
  }
}

resource opGenerationsPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2023-09-01-preview' = {
  parent: opGenerations
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../policies/op-generations.xml')
  }
}

resource opEdits 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: api
  name: 'images-edits'
  properties: {
    displayName: 'Edit image'
    method: 'POST'
    urlTemplate: '/images/edits'
    description: 'Edit an existing image with a text prompt'
  }
}

resource opEditsPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2023-09-01-preview' = {
  parent: opEdits
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../policies/op-edits.xml')
  }
}

resource opVariations 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: api
  name: 'images-variations'
  properties: {
    displayName: 'Create image variation'
    method: 'POST'
    urlTemplate: '/images/variations'
    description: 'Create a variation of an existing image'
  }
}

resource opVariationsPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2023-09-01-preview' = {
  parent: opVariations
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../policies/op-variations.xml')
  }
}

resource opHealth 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: api
  name: 'health'
  properties: {
    displayName: 'Health check'
    method: 'GET'
    urlTemplate: '/health'
    description: 'Gateway health check with optional Foundry reachability probe'
  }
}

resource opHealthPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2023-09-01-preview' = {
  parent: opHealth
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('../policies/op-health.xml')
  }
}

// ─── APIM Subscription for callers ───────────────────────────────────────────

resource subscription 'Microsoft.ApiManagement/service/subscriptions@2023-09-01-preview' = {
  parent: apim
  name: 'zhenjiang-image-sub'
  properties: {
    displayName: 'Zhenjiang Image App'
    scope: api.id
    state: 'active'
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

output apiId string = api.id
output apiPath string = api.properties.path
output backendId string = backend.id
output gatewayUrl string = '${apim.properties.gatewayUrl}/v1'
output subscriptionId string = subscription.id
