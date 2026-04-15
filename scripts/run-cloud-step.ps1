[CmdletBinding()]
param(
    [ValidateSet("text", "edit", "variation", "library")]
    [string]$Phase,
    [string]$ResourceGroup = "image",
    [string]$ApiAppName = "image-api-m21426",
    [string]$SubscriptionId = "1f587540-6ec9-414c-a0d0-0e792ed8ed63",
    [string]$ApiBaseUrl = "https://image-api-m21426.chinacloudsites.cn",
    [string]$WebBaseUrl = "https://image-web-m21426.chinacloudsites.cn",
    [string]$FolderId,
    [string]$SourceImageUrl,
    [int]$JobTimeoutSeconds = 420,
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
const phase = __PHASE__;
const apiBaseUrl = __API_BASE_URL__;
const webBaseUrl = __WEB_BASE_URL__;
const folderId = __FOLDER_ID__;
const sourceImageUrl = __SOURCE_IMAGE_URL__;
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

async function saveGenerated(jobId, targetFolderId) {
  return requestJson(`${apiBaseUrl}/api/library/save-generated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId, folderId: targetFolderId }),
  });
}

async function runUploadFlow(path, prompt, imageUrl) {
  const sourceResponse = await fetch(imageUrl);
  if (!sourceResponse.ok) {
    throw new Error(`Failed to download source image from ${imageUrl}, HTTP ${sourceResponse.status}.`);
  }

  const contentType = sourceResponse.headers.get("content-type") || "image/png";
  const imageBuffer = Buffer.from(await sourceResponse.arrayBuffer());
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("image", new Blob([imageBuffer], { type: contentType }), "acceptance-source.png");

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
  const saved = await saveGenerated(finalJob.id, folderId);

  return {
    created,
    finalJob,
    previewBytes: previewBuffer.length,
    saved,
  };
}

(async () => {
  let result;

  if (phase === "text") {
    const frontendResponse = await fetch(webBaseUrl);
    const frontendHtml = await frontendResponse.text();
    const health = await requestJson(`${apiBaseUrl}/api/health/summary`);
    const createdFolder = await requestJson(`${apiBaseUrl}/api/library/folders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `cloud-acceptance-${Date.now()}`,
        description: "Azure China 云内自动验收测试目录",
      }),
    });
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

    const preview = await fetch(apiBaseUrl + textFinal.resultImageUrl);
    if (!preview.ok) {
      throw new Error(`text-to-image preview download failed with HTTP ${preview.status}.`);
    }

    const previewBuffer = Buffer.from(await preview.arrayBuffer());
    const saved = await saveGenerated(textFinal.id, createdFolder.id);

    result = {
      checkedAt: new Date().toISOString(),
      frontend: {
        statusCode: frontendResponse.status,
        containsAppName: frontendHtml.includes("AI 图片处理与图片库"),
      },
      health,
      folder: createdFolder,
      textToImage: {
        created: textCreated,
        finalJob: textFinal,
        previewBytes: previewBuffer.length,
        saved,
      },
      next: {
        folderId: createdFolder.id,
        sourceImageUrl: apiBaseUrl + saved.image.originalUrl,
      },
    };
  } else if (phase === "edit") {
    if (!folderId || !sourceImageUrl) {
      throw new Error("edit phase requires folderId and sourceImageUrl.");
    }

    result = {
      checkedAt: new Date().toISOString(),
      phase,
      folderId,
      sourceImageUrl,
      imageEdit: await runUploadFlow(
        "/api/image/edit",
        "保留主体主体位置，把背景改成现代数据中心机房，并增强冷色科技感灯光",
        sourceImageUrl,
      ),
    };
  } else if (phase === "variation") {
    if (!folderId || !sourceImageUrl) {
      throw new Error("variation phase requires folderId and sourceImageUrl.");
    }

    result = {
      checkedAt: new Date().toISOString(),
      phase,
      folderId,
      sourceImageUrl,
      imageVariation: await runUploadFlow(
        "/api/image/variation",
        "延续原图视觉语言，换成面向企业宣传的城市夜景版本，保持高级感和蓝色氛围",
        sourceImageUrl,
      ),
    };
  } else if (phase === "library") {
    if (!folderId) {
      throw new Error("library phase requires folderId.");
    }

    const folder = await requestJson(`${apiBaseUrl}/api/library/folders/${folderId}`);
    const folderImages = await requestJson(`${apiBaseUrl}/api/library/folders/${folderId}/images`);
    const imageDetails = [];

    for (const image of folderImages.items) {
      imageDetails.push(await requestJson(`${apiBaseUrl}/api/library/images/${image.id}`));
    }

    result = {
      checkedAt: new Date().toISOString(),
      phase,
      folder,
      folderImagesCount: folderImages.items.length,
      sourceModes: folderImages.items.map((image) => image.sourceMode),
      images: imageDetails,
    };
  } else {
    throw new Error(`Unsupported phase: ${phase}`);
  }

  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
'@

$nodeScript = $nodeScript.Replace("__PHASE__", ($Phase | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__API_BASE_URL__", ($ApiBaseUrl | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__WEB_BASE_URL__", ($WebBaseUrl | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__FOLDER_ID__", (($FolderId ?? $null) | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__SOURCE_IMAGE_URL__", (($SourceImageUrl ?? $null) | ConvertTo-Json -Compress))
$nodeScript = $nodeScript.Replace("__JOB_TIMEOUT_MS__", ($JobTimeoutSeconds * 1000).ToString())
$nodeScript = $nodeScript.Replace("__POLL_INTERVAL_MS__", ($PollIntervalSeconds * 1000).ToString())

$encodedNodeScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($nodeScript))
$command = "bash -lc ""echo '$encodedNodeScript' | base64 -d > /tmp/cloud-step.mjs && node /tmp/cloud-step.mjs"""

$payload = @{
    command = $command
    dir = "/home/site/wwwroot"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri $kuduUrl -Method Post -Headers @{
    Authorization = "Bearer $accessToken"
} -ContentType "application/json" -Body $payload

if ($response.ExitCode -ne 0) {
    throw "Cloud step '$Phase' failed.`nSTDOUT:`n$($response.Output)`nSTDERR:`n$($response.Error)"
}

$response.Output
