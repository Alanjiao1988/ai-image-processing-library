[CmdletBinding()]
param(
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [string]$ApiBaseUrl = "https://image-api-m21426.chinacloudsites.cn",
    [string]$WebBaseUrl = "https://image-web-m21426.chinacloudsites.cn",
    [int]$JobTimeoutSeconds = 600,
    [int]$PollIntervalSeconds = 5
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$azChinaPath = Join-Path $repoRoot "az-china.cmd"

function Invoke-AzChina {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandText
    )

    $output = & cmd.exe /d /s /c "`"$azChinaPath`" $CommandText --only-show-errors" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: $CommandText`n$output"
    }

    if ($output -is [System.Array]) {
        return ($output -join [Environment]::NewLine)
    }

    return "$output"
}

$apiHostName = (Invoke-AzChina "webapp show --resource-group $ResourceGroup --name $ApiAppName --subscription $SubscriptionId --query defaultHostName -o tsv").Trim()
if (-not $apiHostName) {
    throw "Could not resolve default host name for $ApiAppName."
}

$scmHostName = $apiHostName -replace "\.chinacloudsites\.cn$", ".scm.chinacloudsites.cn"
$kuduUrl = "https://$scmHostName/api/command"
$accessToken = (Invoke-AzChina "account get-access-token --resource https://appservice.azure.cn --subscription $SubscriptionId --query accessToken -o tsv").Trim()

$nodeScript = @'
const apiBaseUrl = __API_BASE_URL__;
const webBaseUrl = __WEB_BASE_URL__;
const jobTimeoutMs = __JOB_TIMEOUT_MS__;
const pollIntervalMs = __POLL_INTERVAL_MS__;

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function waitForJob(jobId) {
  const deadline = Date.now() + jobTimeoutMs;

  while (Date.now() < deadline) {
    const job = await requestJson(`${apiBaseUrl}/api/jobs/${jobId}`);

    if (job.status === "SUCCEEDED" || job.status === "FAILED") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Job ${jobId} did not finish within ${jobTimeoutMs}ms.`);
}

async function saveGenerated(jobId, folderId) {
  return requestJson(`${apiBaseUrl}/api/library/save-generated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, folderId }),
  });
}

async function runUploadFlow(path, prompt, imageBuffer, contentType, fileName) {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("image", new Blob([imageBuffer], { type: contentType }), fileName);

  const created = await requestJson(`${apiBaseUrl}${path}`, {
    method: "POST",
    body: formData,
  });

  const finalJob = await waitForJob(created.jobId);

  if (finalJob.status !== "SUCCEEDED") {
    throw new Error(`${path} failed: ${finalJob.errorMessage || "unknown error"}`);
  }

  const preview = await fetch(apiBaseUrl + finalJob.resultImageUrl);
  if (!preview.ok) {
    throw new Error(`${path} preview download failed with HTTP ${preview.status}.`);
  }

  const previewBuffer = Buffer.from(await preview.arrayBuffer());

  return {
    created,
    finalJob,
    previewBytes: previewBuffer.length,
  };
}

(async () => {
  const result = {
    checkedAt: new Date().toISOString(),
  };

  const frontendResponse = await fetch(webBaseUrl);
  const frontendHtml = await frontendResponse.text();
  result.frontend = {
    statusCode: frontendResponse.status,
    containsAppName: frontendHtml.includes("AI 图片处理与图片库"),
  };

  result.health = await requestJson(`${apiBaseUrl}/api/health/summary`);

  const folder = await requestJson(`${apiBaseUrl}/api/library/folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `cloud-acceptance-${Date.now()}`,
      description: "Azure China 云内自动验收测试目录",
    }),
  });
  result.folder = folder;

  const textCreated = await requestJson(`${apiBaseUrl}/api/image/text-to-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "企业官网横幅主视觉，一台透明玻璃质感的智能终端悬浮在展厅中央，蓝白商务配色，写实风格，高清",
    }),
  });
  const textFinal = await waitForJob(textCreated.jobId);
  if (textFinal.status !== "SUCCEEDED") {
    throw new Error(`text-to-image failed: ${textFinal.errorMessage || "unknown error"}`);
  }

  const textPreview = await fetch(apiBaseUrl + textFinal.resultImageUrl);
  if (!textPreview.ok) {
    throw new Error(`text-to-image preview download failed with HTTP ${textPreview.status}.`);
  }

  const textPreviewContentType = textPreview.headers.get("content-type") || "image/png";
  const textPreviewBuffer = Buffer.from(await textPreview.arrayBuffer());
  const textSaved = await saveGenerated(textFinal.id, folder.id);

  result.textToImage = {
    created: textCreated,
    finalJob: textFinal,
    previewBytes: textPreviewBuffer.length,
    saved: textSaved,
  };

  const editResult = await runUploadFlow(
    "/api/image/edit",
    "保留主体主体位置，把背景改成现代数据中心机房，并增强冷色科技感灯光",
    textPreviewBuffer,
    textPreviewContentType,
    "acceptance-source.png",
  );
  const editSaved = await saveGenerated(editResult.finalJob.id, folder.id);

  result.imageEdit = {
    ...editResult,
    saved: editSaved,
  };

  const variationResult = await runUploadFlow(
    "/api/image/variation",
    "延续原图视觉语言，换成面向企业宣传的城市夜景版本，保持高级感和蓝色氛围",
    textPreviewBuffer,
    textPreviewContentType,
    "acceptance-source.png",
  );
  const variationSaved = await saveGenerated(variationResult.finalJob.id, folder.id);

  result.imageVariation = {
    ...variationResult,
    saved: variationSaved,
  };

  const folderImages = await requestJson(`${apiBaseUrl}/api/library/folders/${folder.id}/images`);
  const imageDetails = [];

  for (const image of folderImages.items) {
    imageDetails.push(await requestJson(`${apiBaseUrl}/api/library/images/${image.id}`));
  }

  result.library = {
    folderImagesCount: folderImages.items.length,
    sourceModes: folderImages.items.map((image) => image.sourceMode),
    images: imageDetails,
  };

  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
'@

$nodeScript = $nodeScript.Replace("__API_BASE_URL__", ($ApiBaseUrl | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__WEB_BASE_URL__", ($WebBaseUrl | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__JOB_TIMEOUT_MS__", ($JobTimeoutSeconds * 1000).ToString())
$nodeScript = $nodeScript.Replace("__POLL_INTERVAL_MS__", ($PollIntervalSeconds * 1000).ToString())

$encodedNodeScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($nodeScript))
$command = "bash -lc ""echo '$encodedNodeScript' | base64 -d > /tmp/cloud-acceptance.mjs && node /tmp/cloud-acceptance.mjs"""

$payload = @{
    command = $command
    dir = "/home/site/wwwroot"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $kuduUrl -Method Post -Headers @{
    Authorization = "Bearer $accessToken"
} -ContentType "application/json" -Body $payload

if ($response.ExitCode -ne 0) {
    throw "Cloud acceptance failed.`nSTDOUT:`n$($response.Output)`nSTDERR:`n$($response.Error)"
}

$response.Output
