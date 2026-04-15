// foundry.bicep – Provisions an Azure OpenAI resource and gpt-image-1.5 deployment
// on Azure Global. Meant to be deployed to a Global subscription/resource group.

targetScope = 'resourceGroup'

@description('Azure OpenAI resource name')
param openAiName string

@description('Location for the Azure OpenAI resource (must support gpt-image-1.5)')
param location string = 'eastus'

@description('Deployment name for gpt-image-1.5')
param deploymentName string = 'gpt-image-1.5'

@description('Model name')
param modelName string = 'gpt-image-1.5'

@description('Model version (use latest available)')
param modelVersion string = '2025-04-14'

@description('SKU capacity (tokens-per-minute in thousands)')
param skuCapacity int = 1

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAi
  name: deploymentName
  sku: {
    name: 'Standard'
    capacity: skuCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

output endpoint string = openAi.properties.endpoint
output resourceId string = openAi.id
output deploymentName string = deployment.name
