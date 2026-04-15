[CmdletBinding()]
param(
    [string]$WebBaseUrl = "https://image-web-m21426.chinacloudsites.cn",
    [string]$ApiBaseUrl = "https://image-api-m21426.chinacloudsites.cn",
    [int]$JobTimeoutSeconds = 600,
    [int]$PollIntervalSeconds = 5
)

$ErrorActionPreference = "Stop"

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [object]$Body
    )

    $requestParams = @{
        Uri        = $Uri
        Method     = $Method
        TimeoutSec = 180
    }

    if ($null -ne $Body) {
        $requestParams["ContentType"] = "application/json"
        $requestParams["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }

    return Invoke-RestMethod @requestParams
}

function Wait-JobCompletion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ApiBaseUrl,
        [Parameter(Mandatory = $true)]
        [string]$JobId,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)]
        [int]$PollIntervalSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $job = Invoke-JsonApi -Method GET -Uri "$ApiBaseUrl/api/jobs/$JobId"

        if ($job.status -in @("SUCCEEDED", "FAILED")) {
            return $job
        }

        Start-Sleep -Seconds $PollIntervalSeconds
    }

    throw "Job $JobId did not finish within $TimeoutSeconds seconds."
}

function Save-GeneratedResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ApiBaseUrl,
        [Parameter(Mandatory = $true)]
        [string]$JobId,
        [Parameter(Mandatory = $true)]
        [string]$FolderId
    )

    return Invoke-JsonApi -Method POST -Uri "$ApiBaseUrl/api/library/save-generated" -Body @{
        jobId    = $JobId
        folderId = $FolderId
    }
}

function Get-PreviewBytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseUrl,
        [Parameter(Mandatory = $true)]
        [string]$RelativeUrl,
        [Parameter(Mandatory = $true)]
        [string]$OutFile
    )

    $response = Invoke-WebRequest -Uri ($BaseUrl + $RelativeUrl) -Method GET -OutFile $OutFile -TimeoutSec 180
    return $response
}

$folderName = "acceptance-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$tempImagePath = Join-Path $env:TEMP ("acceptance-source-" + [Guid]::NewGuid().ToString() + ".png")

try {
    $frontend = Invoke-WebRequest -Uri $WebBaseUrl -Method GET -TimeoutSec 60
    $health = Invoke-JsonApi -Method GET -Uri "$ApiBaseUrl/api/health/summary"
    $folder = Invoke-JsonApi -Method POST -Uri "$ApiBaseUrl/api/library/folders" -Body @{
        name        = $folderName
        description = "自动验收测试创建，用于验证三种模式和图片库闭环。"
    }

    $textCreated = Invoke-JsonApi -Method POST -Uri "$ApiBaseUrl/api/image/text-to-image" -Body @{
        prompt = "企业官网横幅主视觉，一台透明玻璃质感的智能终端悬浮在展厅中央，蓝白商务配色，写实风格，高清"
    }
    $textFinal = Wait-JobCompletion -ApiBaseUrl $ApiBaseUrl -JobId $textCreated.jobId -TimeoutSeconds $JobTimeoutSeconds -PollIntervalSeconds $PollIntervalSeconds
    if ($textFinal.status -ne "SUCCEEDED") {
        throw "Text-to-image job failed: $($textFinal.errorMessage)"
    }

    $textPreview = Get-PreviewBytes -BaseUrl $ApiBaseUrl -RelativeUrl $textFinal.resultImageUrl -OutFile $tempImagePath
    $textSaved = Save-GeneratedResult -ApiBaseUrl $ApiBaseUrl -JobId $textFinal.id -FolderId $folder.id

    $editCreated = Invoke-RestMethod -Uri "$ApiBaseUrl/api/image/edit" -Method POST -Form @{
        prompt = "保留主体主体位置，把背景改成现代数据中心机房，并增强冷色科技感灯光"
        image  = Get-Item -LiteralPath $tempImagePath
    } -TimeoutSec 180
    $editFinal = Wait-JobCompletion -ApiBaseUrl $ApiBaseUrl -JobId $editCreated.jobId -TimeoutSeconds $JobTimeoutSeconds -PollIntervalSeconds $PollIntervalSeconds
    if ($editFinal.status -ne "SUCCEEDED") {
        throw "Image edit job failed: $($editFinal.errorMessage)"
    }

    $editPreviewPath = Join-Path $env:TEMP ("acceptance-edit-" + [Guid]::NewGuid().ToString() + ".png")
    $editPreview = Get-PreviewBytes -BaseUrl $ApiBaseUrl -RelativeUrl $editFinal.resultImageUrl -OutFile $editPreviewPath
    $editSaved = Save-GeneratedResult -ApiBaseUrl $ApiBaseUrl -JobId $editFinal.id -FolderId $folder.id

    $variationCreated = Invoke-RestMethod -Uri "$ApiBaseUrl/api/image/variation" -Method POST -Form @{
        prompt = "延续原图视觉语言，换成面向企业宣传的城市夜景版本，保持高级感和蓝色氛围"
        image  = Get-Item -LiteralPath $tempImagePath
    } -TimeoutSec 180
    $variationFinal = Wait-JobCompletion -ApiBaseUrl $ApiBaseUrl -JobId $variationCreated.jobId -TimeoutSeconds $JobTimeoutSeconds -PollIntervalSeconds $PollIntervalSeconds
    if ($variationFinal.status -ne "SUCCEEDED") {
        throw "Image variation job failed: $($variationFinal.errorMessage)"
    }

    $variationPreviewPath = Join-Path $env:TEMP ("acceptance-variation-" + [Guid]::NewGuid().ToString() + ".png")
    $variationPreview = Get-PreviewBytes -BaseUrl $ApiBaseUrl -RelativeUrl $variationFinal.resultImageUrl -OutFile $variationPreviewPath
    $variationSaved = Save-GeneratedResult -ApiBaseUrl $ApiBaseUrl -JobId $variationFinal.id -FolderId $folder.id

    $folderImages = Invoke-JsonApi -Method GET -Uri "$ApiBaseUrl/api/library/folders/$($folder.id)/images"
    $imageDetails = @()

    foreach ($image in $folderImages.items) {
        $detail = Invoke-JsonApi -Method GET -Uri "$ApiBaseUrl/api/library/images/$($image.id)"
        $imageDetails += $detail
    }

    $result = [ordered]@{
        checkedAt = (Get-Date).ToString("o")
        frontend = @{
            statusCode = $frontend.StatusCode
            titleCheck = ($frontend.Content -match "AI 图片处理与图片库")
        }
        health = $health
        folder = $folder
        textToImage = @{
            created = $textCreated
            final = $textFinal
            previewBytes = (Get-Item -LiteralPath $tempImagePath).Length
            saved = $textSaved
        }
        imageEdit = @{
            created = $editCreated
            final = $editFinal
            previewBytes = (Get-Item -LiteralPath $editPreviewPath).Length
            saved = $editSaved
        }
        imageVariation = @{
            created = $variationCreated
            final = $variationFinal
            previewBytes = (Get-Item -LiteralPath $variationPreviewPath).Length
            saved = $variationSaved
        }
        library = @{
            folderImagesCount = @($folderImages.items).Count
            sourceModes = @($folderImages.items | ForEach-Object { $_.sourceMode })
            images = $imageDetails
        }
    }

    $result | ConvertTo-Json -Depth 10
}
finally {
    foreach ($file in @($tempImagePath, $editPreviewPath, $variationPreviewPath)) {
        if ($file -and (Test-Path $file)) {
            Remove-Item -LiteralPath $file -Force
        }
    }
}
