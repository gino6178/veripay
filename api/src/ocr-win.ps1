# VeriPay's image helper on Windows, CPU only, nothing to install: for each image, a 64-bit difference hash
# (System.Drawing) and, when asked, its text lines from the OCR engine built into Windows (Windows.Media.Ocr).
# Called by api/src/ocr.js:  powershell -NoProfile -ExecutionPolicy Bypass -File ocr-win.ps1 -List <list.json>
#   list.json: [{"path": "D:\\...\\a.jpg", "ocr": true}, ...]
#   stdout:    {"lang": "en-US", "items": [{"path", "dhash", "w", "h", "lines": ["..."], "error"}]}
param([Parameter(Mandatory = $true)][string]$List)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$items = Get-Content -Raw -Encoding UTF8 $List | ConvertFrom-Json

function DHash([string]$p) {
  $src = [System.Drawing.Image]::FromFile($p)
  try {
    $w = $src.Width; $h = $src.Height
    $b = New-Object System.Drawing.Bitmap 9, 8
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, 9, 8); $g.Dispose()
    [UInt64]$v = 0
    for ($y = 0; $y -lt 8; $y++) { for ($x = 0; $x -lt 8; $x++) {
      $a = $b.GetPixel($x, $y); $c = $b.GetPixel($x + 1, $y)
      $ga = 0.299 * $a.R + 0.587 * $a.G + 0.114 * $a.B; $gc = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
      $v = $v * 2; if ($ga -gt $gc) { $v = $v + 1 }
    } }
    $b.Dispose()
    return @{ dhash = $v.ToString("x16"); w = $w; h = $h }
  } finally { $src.Dispose() }
}

$engine = $null; $lang = $null
if (@($items | Where-Object { $_.ocr }).Count -gt 0) {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $en = New-Object Windows.Globalization.Language "en-US"
  if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($en)) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($en) }
  if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if ($engine) { $lang = $engine.RecognizerLanguage.LanguageTag }
}
function Await($op, [Type]$t) { $task = $script:asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function Ocr([string]$p) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    return @($res.Lines | ForEach-Object { $_.Text })
  } finally { $stream.Dispose() }
}

$out = @()
foreach ($it in $items) {
  $r = @{ path = $it.path; dhash = $null; w = $null; h = $null; lines = $null; error = $null; thumb = $null }
  try { $d = DHash $it.path; $r.dhash = $d.dhash; $r.w = $d.w; $r.h = $d.h } catch { $r.error = "dhash: " + $_.Exception.Message }
  if ($it.thumb) {
    # a smaller JPEG for a vision model (longest side = thumb px), next to the list file
    try {
      $src = [System.Drawing.Image]::FromFile($it.path)
      try {
        $k = [Math]::Min(1.0, [double]$it.thumb / [Math]::Max($src.Width, $src.Height))
        $tw = [int][Math]::Max(1, $src.Width * $k); $th = [int][Math]::Max(1, $src.Height * $k)
        $tb = New-Object System.Drawing.Bitmap $tw, $th
        $tg = [System.Drawing.Graphics]::FromImage($tb); $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $tg.DrawImage($src, 0, 0, $tw, $th); $tg.Dispose()
        $tp = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($List), [System.IO.Path]::GetFileNameWithoutExtension($List) + "-" + $out.Count + ".jpg")
        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
        $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
        $tb.Save($tp, $codec, $ep); $tb.Dispose(); $r.thumb = $tp
      } finally { $src.Dispose() }
    } catch { $r.error = "thumb: " + $_.Exception.Message }
  }
  if ($it.ocr) {
    if ($engine) { try { $r.lines = Ocr $it.path } catch { $r.error = "ocr: " + $_.Exception.Message } } else { $r.error = "ocr: no Windows OCR language installed" }
  }
  $out += $r
}
@{ lang = $lang; items = $out } | ConvertTo-Json -Depth 5 -Compress
