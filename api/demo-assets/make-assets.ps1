# Synthetic demo evidence for the judges' tour (Windows, System.Drawing). Every image says "DEMO (synthetic)".
#   make-assets.ps1                      -> the three photos
#   make-assets.ps1 -Receipt out.jpg -Date 11/04/2026   -> the parts receipt dated that day
#   make-assets.ps1 -Batch "faucet-installed.jpg>C:	a.jpg;sink-dry.jpg>C:	.jpg" -Seed 1234
#     -> fresh copies for one tour job: the same scene, re-composed from the seed (shifted, re-tinted, light and shade
#        moved), so each job's photos are new pictures (a different dHash), not a re-sent file
param([string]$Receipt = "", [string]$Date = "", [string]$Batch = "", [int]$Seed = 0, [string]$Kind = "faucet", [int]$Gal = 40, [string]$Site = "Austin TX", [string]$Ref = "BP-2026-004512", [string]$Store = "AUSTIN PLUMBING SUPPLY")
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Save($bmp, $file) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
  $bmp.Save($file, $codec, $p)
}
if ($Receipt -ne "") {
  # The parts receipt (faucet, heater), the supplier invoice (materials) and the permit, each drawn as a real document
  # and then "photographed": put on a counter, truck seat or bench, turned a little, seen at a slight angle, with a soft
  # shadow, light falling across it and camera noise. Every document says DEMO (a printed line and a diagonal stamp
  # that never covers the TOTAL). The store, invoice and permit details are fictional; no real card number is printed.
  # The words and totals are what the OCR and the checker read: store first, then the date, the items, SUBTOTAL, TAX,
  # TOTAL. A new photo each call (position, angle, light, noise and the surface are random; -Seed fixes them).
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class DemoDoc {
  public static int[] Px(Bitmap b) { BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb); int[] a = new int[b.Width * b.Height]; Marshal.Copy(d.Scan0, a, 0, a.Length); b.UnlockBits(d); return a; }
  public static void Put(Bitmap b, int[] a) { BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb); Marshal.Copy(a, 0, d.Scan0, a.Length); b.UnlockBits(d); }
  static int C(double v) { return v < 0 ? 0 : v > 255 ? 255 : (int)(v + 0.5); }
  static int Argb(int al, double r, double g, double b) { return (al << 24) | (C(r) << 16) | (C(g) << 8) | C(b); }
  static double Hash(int x, int y, int s) { unchecked { uint h = (uint)(x * 374761393 + y * 668265263 + s * 1442695041); h = (h ^ (h >> 13)) * 1274126177u; h ^= h >> 16; return (h & 0xffffff) / 16777215.0; } }
  static double VNoise(double x, double y, int s) {
    int xi = (int)Math.Floor(x), yi = (int)Math.Floor(y); double fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    double a = Hash(xi, yi, s), b = Hash(xi + 1, yi, s), c = Hash(xi, yi + 1, s), d = Hash(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  static double Fbm(double x, double y, int s) { double v = 0, amp = 0.5, f = 1; for (int i = 0; i < 4; i++) { v += amp * VNoise(x * f, y * f, s + i * 17); f *= 2; amp *= 0.5; } return v; }
  // the surface the document lies on: 0 a wood counter, 1 a truck seat, 2 a plywood bench, 3 a laminate counter
  public static void Surface(Bitmap bmp, int kind, int seed) {
    int W = bmp.Width, H = bmp.Height; int[] a = new int[W * H]; Random r = new Random(seed);
    double ang = r.NextDouble() * 0.3 - 0.15, ca = Math.Cos(ang), sa = Math.Sin(ang);
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      double X = x * ca + y * sa, Y = -x * sa + y * ca, R, G, B;
      if (kind == 0) { int pl = (int)Math.Floor((Y + 100000) / 230.0); double g = Fbm(X * 0.012, Y * 0.06, seed + pl); double rings = Math.Sin(Y * 0.16 + g * 10) * 0.5 + 0.5; double t = (0.52 + 0.2 * rings + 0.3 * (Fbm(X * 0.03, Y * 0.7, seed + 5) - 0.5)) * (0.88 + 0.22 * Hash(pl, 7, seed)); double ln = ((Y * 0.23 + g * 16 + Fbm(X * 0.05, Y * 0.05, seed + 9) * 3) % 1.0 + 1.0) % 1.0; if (ln < 0.12) t *= 0.8 + 0.2 * ln / 0.12; t *= 0.94 + 0.06 * Hash(x / 2, y / 2, seed + 11); if ((Y + 100000) % 230.0 < 2.5) t *= 0.55; R = 112 + 92 * t; G = 66 + 60 * t; B = 34 + 34 * t; }
      else if (kind == 1) { double w = (((x / 3) + (y / 3)) % 2 == 0) ? 1.0 : 0.9; double n = Fbm(x * 0.008, y * 0.008, seed); double t = (0.75 + 0.35 * n) * w; R = 96 * t + 12; G = 88 * t + 10; B = 78 * t + 8; }
      else if (kind == 2) { double g = Fbm(X * 0.002, Y * 0.012, seed); double t = 0.72 + 0.14 * Math.Sin(Y * 0.02 + g * 14) + 0.16 * (Fbm(X * 0.05, Y * 0.3, seed + 3) - 0.5); R = 205 * t + 18; G = 168 * t + 14; B = 118 * t + 8; }
      else { double n = Fbm(x * 0.03, y * 0.03, seed); double sp = Hash(x, y, seed) > 0.985 ? -28 : 0; R = 190 + 34 * n + sp; G = 178 + 30 * n + sp; B = 152 + 26 * n + sp; }
      a[y * W + x] = Argb(255, R, G, B);
    }
    Put(bmp, a);
  }
  // thermal print: rows printed a little lighter or darker, a faint worn streak, speckle in the dark dots
  public static void Thermal(Bitmap bmp, int seed, int pr, int pg, int pb) {
    int W = bmp.Width, H = bmp.Height; int[] a = Px(bmp); Random r = new Random(seed);
    int streak = r.Next(W / 5, W * 4 / 5), sw = r.Next(3, 9);
    for (int y = 0; y < H; y++) {
      double row = 0.88 + 0.12 * VNoise(y * 0.015, 0.5, seed) + 0.05 * (VNoise(y * 0.3, 1.5, seed) - 0.5);
      for (int x = 0; x < W; x++) {
        int i = y * W + x, p = a[i]; int al = (p >> 24) & 255; if (al == 0) continue;
        int rr = (p >> 16) & 255, gg = (p >> 8) & 255, bb = p & 255;
        if (rr > pr - 6 && gg > pg - 6 && bb > pb - 6) continue;
        double k = row * (0.9 + 0.2 * r.NextDouble()) * (Math.Abs(x - streak) < sw ? 0.7 : 1.0);
        if (r.NextDouble() < 0.008) k *= 0.55;
        a[i] = Argb(al, pr - (pr - rr) * k, pg - (pg - gg) * k, pb - (pb - bb) * k);
      }
    }
    Put(bmp, a);
  }
  static bool Inside(double[] q, double x, double y) {
    bool pos = false, neg = false;
    for (int k = 0; k < 4; k++) { int n = (k + 1) % 4; double cr = (q[2 * n] - q[2 * k]) * (y - q[2 * k + 1]) - (q[2 * n + 1] - q[2 * k + 1]) * (x - q[2 * k]); if (cr > 0) pos = true; if (cr < 0) neg = true; }
    return !(pos && neg);
  }
  static void BoxBlur(float[] m, int W, int H, int x0, int y0, int x1, int y1, int r) {
    float[] t = new float[m.Length];
    for (int y = y0; y < y1; y++) { double s = 0; int n = 0; for (int x = x0; x < x1; x++) { s += m[y * W + x]; n++; if (n > 2 * r + 1) { s -= m[y * W + x - 2 * r - 1]; n--; } int cx = x - r; if (cx >= x0) t[y * W + cx] = (float)(s / (2 * r + 1)); } }
    for (int x = x0; x < x1; x++) { double s = 0; int n = 0; for (int y = y0; y < y1; y++) { s += t[y * W + x]; n++; if (n > 2 * r + 1) { s -= t[(y - 2 * r - 1) * W + x]; n--; } int cy = y - r; if (cy >= y0) m[cy * W + x] = (float)(s / (2 * r + 1)); } }
  }
  // a soft shadow under the paper: the quad moved by (ox, oy), blurred, darkening the surface
  public static void Shadow(Bitmap dst, double[] q, double ox, double oy, int rad, double strength) {
    int W = dst.Width, H = dst.Height; float[] m = new float[W * H]; double[] s = new double[8];
    for (int k = 0; k < 4; k++) { s[2 * k] = q[2 * k] + ox; s[2 * k + 1] = q[2 * k + 1] + oy; }
    int x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (int k = 0; k < 4; k++) { x0 = Math.Min(x0, (int)s[2 * k]); x1 = Math.Max(x1, (int)s[2 * k]); y0 = Math.Min(y0, (int)s[2 * k + 1]); y1 = Math.Max(y1, (int)s[2 * k + 1]); }
    x0 = Math.Max(0, x0 - 4 * rad); y0 = Math.Max(0, y0 - 4 * rad); x1 = Math.Min(W, x1 + 4 * rad); y1 = Math.Min(H, y1 + 4 * rad);
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) if (Inside(s, x + 0.5, y + 0.5)) m[y * W + x] = 1f;
    for (int p = 0; p < 3; p++) BoxBlur(m, W, H, x0, y0, x1, y1, rad);
    int[] a = Px(dst);
    for (int y = y0; y < y1; y++) for (int x = x0; x < x1; x++) { int i = y * W + x; double f = 1 - strength * m[i]; int p = a[i]; a[i] = Argb(255, ((p >> 16) & 255) * f, ((p >> 8) & 255) * f, (p & 255) * f); }
    Put(dst, a);
  }
  // the paper drawn into the quad q (top-left, top-right, bottom-right, bottom-left) with a true perspective mapping;
  // wave bends the strip a little (in source px), curl shades it like paper that isn't lying flat
  public static void Warp(Bitmap src, Bitmap dst, double[] q, double wave, double phase, double curl) {
    double x0 = q[0], y0 = q[1], x1 = q[2], y1 = q[3], x2 = q[4], y2 = q[5], x3 = q[6], y3 = q[7];
    double sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
    double g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    double a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    double A = e - f * h, B = c * h - b, Cc = b * f - c * e, D = f * g - d, E = a - c * g, F = c * d - a * f, G = d * h - e * g, Hh = b * g - a * h, I = a * e - b * d;
    int SW = src.Width, SH = src.Height, W = dst.Width, Hd = dst.Height; int[] S = Px(src), T = Px(dst);
    int bx0 = W, by0 = Hd, bx1 = 0, by1 = 0;
    for (int k = 0; k < 4; k++) { bx0 = Math.Min(bx0, (int)q[2 * k]); bx1 = Math.Max(bx1, (int)q[2 * k]); by0 = Math.Min(by0, (int)q[2 * k + 1]); by1 = Math.Max(by1, (int)q[2 * k + 1]); }
    int pad = (int)Math.Abs(wave) + 4; bx0 = Math.Max(0, bx0 - pad); by0 = Math.Max(0, by0 - pad); bx1 = Math.Min(W, bx1 + pad); by1 = Math.Min(Hd, by1 + pad);
    for (int y = by0; y < by1; y++) for (int x = bx0; x < bx1; x++) {
      double px = x + 0.5, py = y + 0.5, dn = G * px + Hh * py + I; double u = (A * px + B * py + Cc) / dn, v = (D * px + E * py + F) / dn;
      double us = u * SW + wave * Math.Sin(v * Math.PI * 1.3 + phase), vs = v * SH;
      double cov = Math.Min(Math.Min(us + 0.5, SW - us + 0.5), Math.Min(vs + 0.5, SH - vs + 0.5)); if (cov <= 0) continue; if (cov > 1) cov = 1;
      double fx = us - 0.5, fy = vs - 0.5; int ix = (int)Math.Floor(fx), iy = (int)Math.Floor(fy); double tx = fx - ix, ty = fy - iy;
      double sa = 0, sr = 0, sg = 0, sb = 0;
      for (int k = 0; k < 4; k++) {
        int xx = Math.Max(0, Math.Min(SW - 1, ix + (k & 1))), yy = Math.Max(0, Math.Min(SH - 1, iy + (k >> 1))); double w = ((k & 1) == 1 ? tx : 1 - tx) * ((k >> 1) == 1 ? ty : 1 - ty);
        int p = S[yy * SW + xx]; double al = ((p >> 24) & 255) / 255.0 * w; sa += al; sr += ((p >> 16) & 255) * al; sg += ((p >> 8) & 255) * al; sb += (p & 255) * al;
      }
      if (sa <= 0.001) continue; sr /= sa; sg /= sa; sb /= sa; double cv = cov * sa;
      double sh = 1 - curl * (0.5 - 0.5 * Math.Sin(u * Math.PI * 1.6 + phase)) - 0.035 * Math.Abs(Math.Sin(v * Math.PI * 2.2 + phase * 0.7));
      int i = y * W + x, o = T[i];
      T[i] = Argb(255, ((o >> 16) & 255) * (1 - cv) + sr * sh * cv, ((o >> 8) & 255) * (1 - cv) + sg * sh * cv, (o & 255) * (1 - cv) + sb * sh * cv);
    }
    Put(dst, T);
  }
  // light falling across the picture from (lx, ly), a warm cast, camera noise and a little softness
  public static void Camera(Bitmap bmp, double lx, double ly, double strength, double warm, double noise, int seed) {
    int W = bmp.Width, H = bmp.Height; int[] a = Px(bmp), o = new int[a.Length]; Random r = new Random(seed); double md = Math.Sqrt(W * W + H * H);
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
      int i = y * W + x; double sr = 0, sg = 0, sb = 0, sw = 0;
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int xx = Math.Max(0, Math.Min(W - 1, x + dx)), yy = Math.Max(0, Math.Min(H - 1, y + dy)); double w = (dx == 0 ? 2 : 1) * (dy == 0 ? 2 : 1); int p = a[yy * W + xx]; sr += ((p >> 16) & 255) * w; sg += ((p >> 8) & 255) * w; sb += (p & 255) * w; sw += w; }
      double dd = Math.Sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly)) / md, f = 1 + strength * (0.45 - dd * 1.1);
      double n = (r.NextDouble() + r.NextDouble() - 1) * noise;
      o[i] = Argb(255, sr / sw * f * (1 + warm) + n + (r.NextDouble() - 0.5) * noise * 0.4, sg / sw * f + n, sb / sw * f * (1 - warm * 1.4) + n + (r.NextDouble() - 0.5) * noise * 0.4);
    }
    Put(bmp, o);
  }
}
"@
  $rr = if ($Seed) { New-Object System.Random $Seed } else { New-Object System.Random }
  function H32($s) { $sha = [System.Security.Cryptography.SHA1]::Create(); $b = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes([string]$s)); [long][BitConverter]::ToUInt32($b, 0) }
  $hs = H32 "$Store|$Ref"
  $px = [System.Drawing.GraphicsUnit]::Pixel
  $tf = [System.Drawing.StringFormat]::GenericTypographic
  $tf.FormatFlags = $tf.FormatFlags -bor [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces
  function Fnt($name, $size, $bold = $false) { New-Object System.Drawing.Font $name, ([single]$size), $(if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }), $px }
  function Wid($t, $f) { $script:g.MeasureString($t, $f, 100000, $tf).Width }
  function Fit($t, $name, $size, $bold, $max) { $f = Fnt $name $size $bold; while ((Wid $t $f) -gt $max -and $size -gt 12) { $size -= 1; $f = Fnt $name $size $bold }; $f }
  function Txt($t, $f, $x, $brush = $script:ink) { $script:g.DrawString($t, $f, $brush, [single]$x, [single]$script:y, $tf) }
  function Cen($t, $f, $lh = 1.38, $brush = $script:ink) { Txt $t $f (($script:W - (Wid $t $f)) / 2) $brush; $script:y += $f.Size * $lh }
  function Lft($t, $f, $lh = 1.38, $dx = 0) { Txt $t $f ($script:mx + $dx); $script:y += $f.Size * $lh }
  function LR($l, $r, $f, $lh = 1.38, $dx = 0, $rx = 0) { Txt $l $f ($script:mx + $dx); Txt $r $f ($script:W - $script:mx - $rx - (Wid $r $f)); $script:y += $f.Size * $lh }
  function Rule($dash = $true, $wid = 2) { $p = New-Object System.Drawing.Pen $script:inkC, $wid; if ($dash) { $p.DashPattern = @(4, 3) }; $yy = $script:y + 8; $script:g.DrawLine($p, $script:mx, $yy, $script:W - $script:mx, $yy); $script:y += 30 }
  # a total line: the amount in the amount column (kept off the paper edge: an amount printed right at the edge gets a
  # stray digit from the OCR), its label two characters before it, so label and amount read as one line
  function Tot($l, $r, $f, $lh) { $cw = Wid "0" $f; $xr = $script:W - $script:mx - $script:amtR - (Wid $r $f); Txt $l $f ($xr - 2 * $cw - (Wid $l $f)); Txt $r $f $xr; $script:y += $f.Size * $lh }
  function NewPage($w, $h, $paper) {
    $script:W = $w; $script:page = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $script:g = [System.Drawing.Graphics]::FromImage($script:page); $script:g.Clear($paper)
    $script:g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias; $script:g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  }
  # the diagonal DEMO stamp, centred at (cx, cy): red ink, a little uneven, in a rounded box
  function Stamp($cx, $cy, $size, $angle, $sub) {
    $gs = $script:g.Save(); $script:g.TranslateTransform([single]$cx, [single]$cy); $script:g.RotateTransform([single]$angle)
    $c = [System.Drawing.Color]::FromArgb(150, 196, 30, 36); $br = New-Object System.Drawing.SolidBrush $c
    $f = Fnt "Arial Black" $size; $fs = Fnt "Arial" ([int]($size * 0.2)) $true
    $w = Wid "DEMO" $f; $ws = Wid $sub $fs; $bw = [Math]::Max($w, $ws) + $size * 0.5; $bh = $size * 1.75
    $pen = New-Object System.Drawing.Pen $c, ([single]($size * 0.07)); $script:g.DrawRectangle($pen, [single](-$bw / 2), [single](-$bh / 2), [single]$bw, [single]$bh)
    $script:g.DrawString("DEMO", $f, $br, [single](-$w / 2), [single](-$bh / 2 + $size * 0.12), $tf)
    $script:g.DrawString($sub, $fs, $br, [single](-$ws / 2), [single]($bh / 2 - $size * 0.42), $tf)
    $script:g.Restore($gs)
  }
  # the photo: the page laid on a surface, turned, seen at a slight angle, shadowed and lit
  function Shoot($page, $outW, $outH, $surfaces, $fitW, $fitH, $maxTurn, $tilt, $wave, $curl) {
    $bmp = New-Object System.Drawing.Bitmap $outW, $outH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    [DemoDoc]::Surface($bmp, $surfaces[$rr.Next($surfaces.Count)], $rr.Next(1, 1000000))
    $s = [Math]::Min($fitW * $outW / $page.Width, $fitH * $outH / $page.Height) * (0.95 + 0.05 * $rr.NextDouble())
    $hw = $page.Width * $s / 2; $hh = $page.Height * $s / 2
    $cx = $outW / 2 + $rr.Next(-[int]($outW * 0.04), [int]($outW * 0.04) + 1); $cy = $outH / 2 + $rr.Next(-[int]($outH * 0.02), [int]($outH * 0.02) + 1)
    $a = ($rr.NextDouble() * 2 - 1) * $maxTurn * [Math]::PI / 180; $ca = [Math]::Cos($a); $sa = [Math]::Sin($a)
    $t = $tilt * (0.6 + 0.4 * $rr.NextDouble()); $top = 1 - $t; $bot = 1 + $t * 0.3
    $pts = @(@((-$hw * $top), (-$hh)), @(($hw * $top), (-$hh)), @(($hw * $bot), $hh), @((-$hw * $bot), $hh))
    $q = New-Object 'double[]' 8
    for ($k = 0; $k -lt 4; $k++) { $x = $pts[$k][0] + $rr.Next(-5, 6); $y = $pts[$k][1] + $rr.Next(-5, 6); $q[2 * $k] = $cx + $x * $ca - $y * $sa; $q[2 * $k + 1] = $cy + $x * $sa + $y * $ca }
    $lx = $rr.Next(0, $outW); $ly = $rr.Next(-[int]($outH / 3), [int]($outH / 3))
    [DemoDoc]::Shadow($bmp, $q, ($rr.Next(6, 18) * ($(if ($lx -lt $outW / 2) { 1 } else { -1 }))), $rr.Next(8, 20), 12, 0.42)
    [DemoDoc]::Warp($page, $bmp, $q, $wave * (0.5 + $rr.NextDouble()), $rr.NextDouble() * 6.28, $curl * (0.6 + 0.6 * $rr.NextDouble()))
    [DemoDoc]::Camera($bmp, $lx, $ly, 0.22 + 0.12 * $rr.NextDouble(), 0.02 + 0.03 * $rr.NextDouble(), 7, $rr.Next(1, 1000000))
    $bmp
  }
  $streets = @{ "LAMAR" = "S LAMAR BLVD"; "BURNET" = "BURNET RD"; "OLTORF" = "E OLTORF ST"; "RIVERSIDE" = "E RIVERSIDE DR"; "CONGRESS" = "S CONGRESS AVE"; "MANCHACA" = "MANCHACA RD"; "GUADALUPE" = "N GUADALUPE ST"; "ANDERSON" = "W ANDERSON LN"; "BEN WHITE" = "W BEN WHITE BLVD"; "SLAUGHTER" = "W SLAUGHTER LN"; "WILLIAM CANNON" = "W WILLIAM CANNON DR"; "AIRPORT" = "AIRPORT BLVD" }
  $street = "S LAMAR BLVD"; foreach ($k in $streets.Keys) { if ($Store -match "\b$k\b") { $street = $streets[$k] } }
  $zips = @("78704", "78745", "78757", "78702", "78741", "78748", "78723", "78756")
  $addr = "$(1000 + $hs % 8900) $street"; $city = "AUSTIN TX $($zips[$hs % $zips.Count])"; $tel = "512-555-01$('{0:D2}' -f ($hs % 100))"
  $hr = 7 + ($hs -shr 3) % 10; $mn = ($hs -shr 7) % 60; $time = "{0}:{1:D2} {2}" -f $(if ($hr -gt 12) { $hr - 12 } else { $hr }), $mn, $(if ($hr -ge 12) { "PM" } else { "AM" })
  $L36 = "ABCDEFGHJKLMNPQRSTUVWXYZ"; $auth = -join (0..5 | ForEach-Object { $L36[(($hs -shr ($_ * 5)) + $_ * 7) % $L36.Length] })

  if ($Kind -eq "faucet" -or $Kind -eq "heater") {
    # a thermal store receipt, 80 mm paper, 576 dots of print, 36 columns. Done-OCR finds lines on the photo scaled to
    # 640 px on the long side: the type is large and the lines well apart, so each line still stands alone at that size.
    $paperC = [System.Drawing.Color]::FromArgb(250, 248, 241); $script:inkC = [System.Drawing.Color]::FromArgb(44, 42, 46); $script:ink = New-Object System.Drawing.SolidBrush $script:inkC
    NewPage 640 1800 $paperC; $script:mx = 46; $script:y = 44; $script:amtR = 60
    $f = Fnt "Lucida Console" 25; $fs = Fnt "Lucida Console" 21; $fT = Fnt "Lucida Console" 27
    $fH = Fit $Store "Arial Narrow" 38 $false ($W - 2 * $mx)
    Cen $Store $fH 1.45
    Cen $addr $f 1.5; Cen "$city  $tel" $f 1.75
    Cen "DEMO RECEIPT - NOT A REAL PURCHASE" $fs 2.0
    Lft "STORE #$('{0:D4}' -f (100 + $hs % 900)) REG $('{0:D2}' -f (1 + ($hs -shr 4) % 8)) CSH $(100 + ($hs -shr 6) % 800)" $f 1.6
    Lft "TRANS# $Ref" $f 1.6
    Lft "DATE $Date  $time" $f 1.5
    $script:y += 22
    $items = if ($Kind -eq "heater") { @(@("$Gal GAL GAS WATER HTR", "699.00", "0$(41000 + $Gal * 7)"), @("2 GAL EXPANSION TANK", "54.00", "038112"), @("T&P VALVE + FITTINGS", "68.00", "052407")) } else { @(@("MOEN 1225 CARTRIDGE", "28.97", "049612"), @("1/4 TURN STOP VALVE", "14.49", "061538")) }
    foreach ($it in $items) { LR "$($it[2]) $($it[0])" "$($it[1])" $f 1.6 0 $script:amtR }
    $script:y += 22
    $sub = if ($Kind -eq "heater") { "821.00" } else { "43.46" }; $tax = if ($Kind -eq "heater") { "67.73" } else { "3.59" }; $tot = if ($Kind -eq "heater") { "`$888.73" } else { "`$47.05" }
    Tot "SUBTOTAL" $sub $f 1.6; Tot "TAX 8.25%" $tax $f 1.7
    Tot "TOTAL" $tot $fT 1.6; $script:y += 34
    # after the TOTAL: the payment lines carry no digits (the DEMO stamp sits over them and the barcode, and a torn
    # word is harmless where a torn number would read as a stray amount)
    Lft "ITEMS SOLD $($items.Count)" $f 1.6; Lft "PAID: CARD (DEMO) APPROVED" $f 1.6; Lft "AUTH CODE $auth" $f 1.6; Lft "NO CARD NUMBER - DEMO ONLY" $f 1.6
    $script:y += 14
    # a barcode from the receipt number (code-39 style bars from the characters)
    $bars = New-Object System.Collections.ArrayList; foreach ($ch in ("*" + $Ref + "*").ToCharArray()) { $v = ([int]$ch * 2654435761L) % 4096; for ($k = 0; $k -lt 9; $k++) { [void]$bars.Add([int](1 + (($v -shr $k) -band 1) * 2)) }; [void]$bars.Add(1) }
    $bw = 0; foreach ($b in $bars) { $bw += $b * 2 }; $bx = ($W - $bw) / 2
    for ($k = 0; $k -lt $bars.Count; $k++) { if ($k % 2 -eq 0) { $script:g.FillRectangle($script:ink, [single]$bx, [single]$script:y, [single]($bars[$k] * 2), 80) }; $bx += $bars[$k] * 2 }
    $stampY = $script:y + 30; $script:y += 80 + 80
    Cen "RETURNS WITHIN 30 DAYS WITH RECEIPT" $fs 1.7; Cen "THANK YOU!" $f 1.8
    Cen "DEMO RECEIPT - NOT A REAL PURCHASE" $fs 1.5
    $script:y += 36; $H = [int]$script:y
    [DemoDoc]::Thermal($script:page, $rr.Next(1, 1000000), 250, 248, 241)
    Stamp ($W / 2 + $rr.Next(-16, 17)) $stampY 92 (-9 - 5 * $rr.NextDouble()) "NOT A REAL PURCHASE"
    # the torn bottom edge
    $script:g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $pts = New-Object System.Collections.ArrayList; [void]$pts.Add((New-Object System.Drawing.PointF 0, ($H + 40))); for ($x = 0; $x -le $W; $x += 10) { [void]$pts.Add((New-Object System.Drawing.PointF $x, ($H - 10 + $(if (($x / 10) % 2) { 0 } else { 9 }) + $rr.Next(0, 4)))) }; [void]$pts.Add((New-Object System.Drawing.PointF $W, ($H + 40)))
    $script:g.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Transparent)), $pts.ToArray())
    $script:g.Dispose(); $doc = $script:page.Clone((New-Object System.Drawing.Rectangle 0, 0, $W, ($H + 4)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb); $script:page.Dispose()
    $photo = Shoot $doc 1200 1600 @(0, 1, 3) 0.86 0.95 2.5 0.04 3 0.12
  }
  elseif ($Kind -eq "materials") {
    # a supplier invoice on letter paper (150 dpi), laser printed. Large type: the photo is read at 640 px on its long
    # side, where this page is about 460 px wide, so a line has to be about 40 px tall here to stay readable there.
    $script:inkC = [System.Drawing.Color]::FromArgb(24, 24, 28); $script:ink = New-Object System.Drawing.SolidBrush $script:inkC
    NewPage 1275 1650 ([System.Drawing.Color]::FromArgb(250, 250, 247)); $script:mx = 80; $script:y = 70; $script:amtR = 40
    $f = Fnt "Arial" 40; $fs = Fnt "Arial" 32; $fb = Fnt "Arial" 40 $true; $fT = Fnt "Arial" 48 $true; $fc = Fnt "Arial" 26
    $acc = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 78, 121)); $red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 30, 36))
    $grey = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 90, 96))
    $fH = Fit $Store "Arial" 52 $true ($W - 2 * $mx)
    Txt $Store $fH $mx $acc; $script:y += $fH.Size * 1.5
    Lft "$addr, $city" $fs 1.45; Lft "TEL $tel  -  WHOLESALE PLUMBING SUPPLY" $fs 1.9
    Lft "INVOICE" (Fnt "Arial" 72 $true) 1.35
    $script:g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 232, 232))), $mx, $script:y - 10, $W - 2 * $mx, 58)
    Cen "DEMO INVOICE - NOT A REAL PURCHASE" $fs 2.0 $red
    Lft "INVOICE # $Ref" $fb 1.55; Lft "DATE: $Date" $fb 1.55; Lft "BILL TO: Demo customer" $f 1.55; Lft "JOB SITE: $Site" (Fit "JOB SITE: $Site" "Arial" 40 $false ($W - 2 * $mx)) 1.9
    $hb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(226, 232, 240)); $script:g.FillRectangle($hb, $mx, $script:y - 10, $W - 2 * $mx, 54)
    $ra = $W - $mx - $script:amtR; $rq = $ra - 190
    Txt "ITEM / DESCRIPTION" $fc ($mx + 14); Txt "QTY" $fc ($rq - (Wid "QTY" $fc)); Txt "AMOUNT" $fc ($ra - (Wid "AMOUNT" $fc)); $script:y += 66
    foreach ($it in @(@("ET-2G-075", "2 GAL EXPANSION TANK", "54.00"), @("PRV-34-LF", "PRESSURE REDUCING VALVE", "26.40"))) {
      Txt $it[0] $fc ($mx + 14) $grey; $script:y += 34; Txt $it[1] $f ($mx + 14); Txt "1" $f ($rq - (Wid "1" $f)); Txt $it[2] $f ($ra - (Wid $it[2] $f)); $script:y += 64
      $script:g.DrawLine((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(205, 205, 210)), 1), $mx, $script:y - 12, $W - $mx, $script:y - 12)
    }
    $script:y += 22
    Tot "SUBTOTAL" "80.40" $f 1.5; Tot "TAX 8.25%" "6.63" $f 1.6
    Tot "TOTAL" "`$87.03" $fT 1.5
    $stampY = $script:y + 215
    $script:y = 1500; Cen "Thank you for your business. Returns within 30 days with this invoice." $fc 1.6
    Cen "DEMO INVOICE - NOT A REAL PURCHASE - synthetic, VeriPay demo" $fc 1.5 $red
    Stamp ($W / 2 - 130 + $rr.Next(-30, 31)) $stampY 120 (-10 - 5 * $rr.NextDouble()) "NOT A REAL PURCHASE"
    $script:g.Dispose(); $doc = $script:page
    $photo = Shoot $doc 1200 1600 @(2, 0, 3) 0.95 0.94 2.0 0.04 2 0.06
  }
  else {
    # the permit: a printed card on yellow card stock, posted on the job; no seal, no logo, marked DEMO. Large type for
    # the same reason as the invoice; the fields are "LABEL: value" lines between thin rules.
    $script:inkC = [System.Drawing.Color]::FromArgb(22, 22, 26); $script:ink = New-Object System.Drawing.SolidBrush $script:inkC
    NewPage 1275 1650 ([System.Drawing.Color]::FromArgb(250, 238, 170)); $script:mx = 90; $script:y = 80
    $f = Fnt "Arial" 40; $fs = Fnt "Arial" 30; $fb = Fnt "Arial" 40 $true; $fc = Fnt "Arial" 24; $fcb = Fnt "Arial" 24 $true
    $red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 30, 36))
    $script:g.DrawRectangle((New-Object System.Drawing.Pen $script:inkC, 5), 44, 44, $W - 88, 1562)
    Cen "CITY OF AUSTIN" (Fnt "Arial" 56 $true) 1.25; Cen "DEVELOPMENT SERVICES DEPARTMENT (DEMO)" (Fnt "Arial" 34 $true) 1.5
    Cen "PLUMBING PERMIT" (Fnt "Arial Black" 80) 1.3
    Cen "DEMO DOCUMENT - NOT A REAL PERMIT" $fs 1.5 $red
    Cen "POST THIS CARD AT THE JOB SITE UNTIL FINAL INSPECTION" $fc 2.2
    $rp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 110, 70)), 2
    function Field($label, $value) { $script:g.DrawLine($rp, $script:mx, $script:y - 14, $script:W - $script:mx, $script:y - 14); Txt $label $f $script:mx; Txt $value $f ($script:mx + (Wid "$label " $f)); $script:y += 74 }
    Field "PERMIT NO.:" "$Ref"
    Field "ISSUED:" "$Date"
    Field "EXPIRES:" "180 DAYS AFTER ISSUE"
    Field "SITE ADDRESS:" "$Site"
    Field "WORK:" "REPLACE $Gal GAL GAS WATER HEATER"
    Field "TYPE:" "PLUMBING - RESIDENTIAL"
    Field "STATUS:" "ISSUED"
    $script:g.DrawLine($rp, $mx, $script:y - 14, $W - $mx, $script:y - 14); $script:y += 16
    Lft "INSPECTION RECORD" $fcb 1.7
    $ins = $script:y; $cols = @(0, 520, 720, 900); $hd = @("INSPECTION", "DATE", "INSPECTOR", "RESULT")
    for ($k = 0; $k -lt 4; $k++) { Txt $hd[$k] $fcb ($mx + $cols[$k] + 10) }; $script:y += 40
    foreach ($r in @("ROUGH-IN / UNDERGROUND", "GAS PRESSURE TEST", "WATER HEATER / VENT", "FINAL")) { $script:g.DrawLine((New-Object System.Drawing.Pen $script:inkC, 1), $mx, $script:y - 8, $W - $mx, $script:y - 8); Txt $r $fc ($mx + 10); Txt "PENDING" $fc ($mx + $cols[3] + 10); $script:y += 50 }
    $script:g.DrawLine((New-Object System.Drawing.Pen $script:inkC, 1), $mx, $script:y - 8, $W - $mx, $script:y - 8)
    foreach ($cx in $cols[1..3]) { $script:g.DrawLine((New-Object System.Drawing.Pen $script:inkC, 1), $mx + $cx, $ins + 34, $mx + $cx, $script:y - 8) }
    $stampY = $ins + 130
    $script:y += 24
    Lft "Call for inspections 24 hours ahead. Work must not be covered before it is inspected." $fc 1.5
    Lft "1. Gas shut-off valve and sediment trap at the appliance; drip leg on the gas supply." $fc 1.5
    Lft "2. Vent connector per the manufacturer$([char]39)s instructions; clearances to combustibles." $fc 1.5
    Lft "3. T&P relief discharge piped full size to within 6 in. of the floor or to a drain." $fc 1.5
    $script:y = 1540; Cen "DEMO DOCUMENT - NOT ISSUED BY ANY CITY - NOT A REAL PERMIT" $fc 1.4 $red
    Stamp ($W / 2 + 120 + $rr.Next(-30, 31)) $stampY 120 (-10 - 5 * $rr.NextDouble()) "NOT A REAL PERMIT"
    $script:g.Dispose(); $doc = $script:page
    $photo = Shoot $doc 1200 1600 @(3, 2, 0) 0.95 0.94 2.0 0.04 2 0.06
  }
  Save $photo $Receipt; $photo.Dispose(); $doc.Dispose(); exit 0
}
$script:rng = if ($Seed) { New-Object System.Random $Seed } else { $null }
$script:out = @{}
foreach ($pair in ($Batch -split ";" | Where-Object { $_ })) { $a = $pair -split ">"; $script:out[$a[0]] = $a[1] }
function Photo($file, $bg, $draw, $caption) {
  if ($Batch -ne "" -and -not $script:out.ContainsKey($file)) { return }
  $bmp = New-Object System.Drawing.Bitmap 640, 480
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $c = [System.Drawing.ColorTranslator]::FromHtml($bg)
  if ($script:rng) { $d = $script:rng.Next(-40, 41); $c = [System.Drawing.Color]::FromArgb([Math]::Max(0, [Math]::Min(255, $c.R + $d)), [Math]::Max(0, [Math]::Min(255, $c.G + $d)), [Math]::Max(0, [Math]::Min(255, $c.B + $d))) }
  $g.Clear($c)
  if ($script:rng) {
    # light and shade falling differently: a few soft bands, and the scene shifted
    for ($i = 0; $i -lt 5; $i++) { $a = $script:rng.Next(30, 110); $v = if ($script:rng.Next(2)) { 255 } else { 0 }; $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, $v, $v, $v))), $script:rng.Next(-100, 560), $script:rng.Next(-80, 380), $script:rng.Next(80, 320), $script:rng.Next(60, 260)) }
    $g.TranslateTransform($script:rng.Next(-90, 91), $script:rng.Next(-60, 61))
  }
  & $draw $g
  $g.ResetTransform()
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 0, 0, 0))), 0, 420, 640, 60)
  $g.DrawString("DEMO PHOTO (synthetic): $caption", (New-Object System.Drawing.Font "Segoe UI", 15), [System.Drawing.Brushes]::White, 12, 434)
  $target = if ($Batch -ne "") { $script:out[$file] } else { Join-Path $here $file }
  Save $bmp $target; $g.Dispose(); $bmp.Dispose()
}
# new cartridge: a chrome faucet body top-left, a bright cartridge
Photo "faucet-installed.jpg" "#2b3a4a" { param($g)
  $g.FillRectangle([System.Drawing.Brushes]::Silver, 60, 60, 120, 300)
  $g.FillEllipse([System.Drawing.Brushes]::Gainsboro, 40, 30, 160, 80)
  $g.FillRectangle([System.Drawing.Brushes]::Gold, 300, 150, 260, 70)
  $g.FillRectangle([System.Drawing.Brushes]::White, 330, 165, 40, 40) } "new cartridge installed"
# under the sink, dry: dark cabinet, pipes, a white towel bottom right
Photo "sink-dry.jpg" "#d9d2c3" { param($g)
  $g.FillRectangle([System.Drawing.Brushes]::SaddleBrown, 0, 0, 640, 140)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::DimGray), 26
  $g.DrawLine($p, 200, 140, 200, 380); $g.DrawLine($p, 200, 380, 470, 380); $g.DrawLine($p, 470, 380, 470, 160)
  $g.FillRectangle([System.Drawing.Brushes]::White, 420, 300, 200, 110) } "under the sink, water on 10 min, dry"
# the worn valve: rust-coloured blob, diagonal stripes
Photo "valve-worn.jpg" "#5b6b3a" { param($g)
  for ($i = 0; $i -lt 640; $i += 60) { $g.FillPolygon([System.Drawing.Brushes]::OliveDrab, @((New-Object System.Drawing.Point $i, 0), (New-Object System.Drawing.Point ($i + 30), 0), (New-Object System.Drawing.Point ($i - 170), 420), (New-Object System.Drawing.Point ($i - 200), 420))) }
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#a0522d"))), 380, 60, 220, 220)
  $g.FillEllipse([System.Drawing.Brushes]::Black, 450, 130, 80, 80) } "corroded shut-off valve, weeping"
# ---- scenes for the other job types (drains, cleaning, handyman): simple shapes, each captioned and marked synthetic ----
function Brush($c) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($c)) }
Photo "drain-clogged.jpg" "#cfd6dc" { param($g)
  $g.FillEllipse((Brush "#ffffff"), 120, 80, 400, 260); $g.FillEllipse((Brush "#7a6a55"), 200, 140, 240, 140); $g.FillEllipse((Brush "#3a3a3a"), 290, 190, 60, 40) } "sink full of standing water, drain clogged"
Photo "drain-clear.jpg" "#d5dde3" { param($g)
  $g.FillEllipse((Brush "#ffffff"), 120, 80, 400, 260); $g.FillEllipse((Brush "#9ecae1"), 250, 170, 140, 80); $g.FillEllipse((Brush "#222222"), 300, 195, 40, 30)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::SteelBlue), 10; $g.DrawLine($p, 320, 0, 320, 170) } "water running, draining freely"
Photo "trap-cleared.jpg" "#b9b2a6" { param($g)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::WhiteSmoke), 34; $g.DrawArc($p, 200, 120, 240, 200, 0, 180); $g.DrawLine($p, 200, 40, 200, 220); $g.DrawLine($p, 440, 220, 600, 220)
  $g.FillEllipse((Brush "#5b4a3a"), 40, 300, 120, 70) } "P-trap opened and cleared; the clog in the bucket"
Photo "clean-kitchen.jpg" "#efe9df" { param($g)
  $g.FillRectangle((Brush "#8d6e63"), 0, 260, 640, 160); $g.FillRectangle((Brush "#eceff1"), 0, 230, 640, 34); $g.FillRectangle((Brush "#b0bec5"), 420, 120, 160, 110); $g.FillEllipse((Brush "#90a4ae"), 80, 180, 90, 50) } "kitchen counters and stovetop wiped clean"
Photo "clean-bathroom.jpg" "#e3f2fd" { param($g)
  $g.FillRectangle((Brush "#ffffff"), 60, 200, 220, 190); $g.FillEllipse((Brush "#ffffff"), 380, 230, 150, 170); $g.FillRectangle((Brush "#b3e5fc"), 330, 40, 260, 150) } "bathroom: tub, toilet and mirror clean"
Photo "clean-floor.jpg" "#c8b29a" { param($g)
  for ($i = 0; $i -lt 640; $i += 80) { $g.FillRectangle((Brush "#bfa688"), $i, 0, 40, 420) }; $g.FillRectangle((Brush "#607d8b"), 470, 60, 40, 300) } "floors vacuumed and mopped"
Photo "tv-mounted.jpg" "#eae6df" { param($g)
  $g.FillRectangle((Brush "#111111"), 140, 80, 360, 210); $g.FillRectangle((Brush "#1e88e5"), 155, 95, 330, 180); $g.FillRectangle((Brush "#9e9e9e"), 300, 290, 40, 120) } "TV mounted level, cables hidden"
Photo "bracket-level.jpg" "#e8e3da" { param($g)
  $g.FillRectangle((Brush "#424242"), 200, 140, 240, 120); $g.FillRectangle((Brush "#fdd835"), 170, 100, 300, 30); $g.FillEllipse((Brush "#76ff03"), 305, 105, 30, 20) } "wall bracket on the studs, level on it"
Photo "furniture-built.jpg" "#efe7da" { param($g)
  $g.FillRectangle((Brush "#a1887f"), 160, 60, 320, 330); for ($y = 120; $y -lt 380; $y += 80) { $g.FillRectangle((Brush "#795548"), 170, $y, 300, 12) } } "bookshelf assembled and anchored to the wall"
Photo "wall-patched.jpg" "#ece4d6" { param($g)
  $g.FillRectangle((Brush "#f5f0e6"), 0, 0, 640, 420); $g.FillEllipse((Brush "#e9e1d2"), 260, 150, 120, 90) } "drywall patched, sanded and painted to match"
Photo "repair-done.jpg" "#dfe3e6" { param($g)
  $g.FillRectangle((Brush "#8d6e63"), 220, 40, 200, 360); $g.FillEllipse((Brush "#ffd54f"), 380, 210, 22, 22) } "door rehung: hinges tight, latch catches"
# ---- water heater scenes (old tank, new tank, rating plate, venting, T&P valve, permit sticker) --------------------------
Photo "wh-old.jpg" "#6d6a63" { param($g)
  $g.FillRectangle((Brush "#bdbdbd"), 230, 40, 180, 340); $g.FillEllipse((Brush "#9e9e9e"), 230, 20, 180, 50); $g.FillRectangle((Brush "#8d4b23"), 230, 330, 180, 50); $g.FillEllipse((Brush "#a0522d"), 300, 300, 70, 40) } "old water heater, rust at the base"
Photo "wh-new.jpg" "#cfd8dc" { param($g)
  $g.DrawString("$Gal GAL", (New-Object System.Drawing.Font "Segoe UI", 18, ([System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::Black, 280, 200)
  $g.FillRectangle((Brush "#eceff1"), 230, 40, 180, 340); $g.FillEllipse((Brush "#ffffff"), 230, 20, 180, 50); $g.FillRectangle((Brush "#1e88e5"), 260, 120, 120, 40)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::Goldenrod), 12; $g.DrawLine($p, 280, 0, 280, 30); $g.DrawLine($p, 360, 0, 360, 30); $g.FillEllipse((Brush "#90a4ae"), 440, 60, 90, 120) } "new 40-gallon heater installed, expansion tank beside it"
Photo "wh-label.jpg" "#eceff1" { param($g)
  $g.FillRectangle((Brush "#ffffff"), 120, 60, 400, 300); $g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 4), 120, 60, 400, 300)
  $f = New-Object System.Drawing.Font "Consolas", 20; $b = [System.Drawing.Brushes]::Black
  $g.DrawString("RATING PLATE (demo)", $f, $b, 140, 80); $g.DrawString("MODEL  GX-$($Gal)T (demo)", $f, $b, 140, 140); $g.DrawString("SERIAL 2611-04A-7731", $f, $b, 140, 190); $g.DrawString("$Gal GAL  $([int]($Gal * 1000)) BTU/H", $f, $b, 140, 240) } "the new heater's rating plate: model and serial"
Photo "wh-venting.jpg" "#b0bec5" { param($g)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::Silver), 46; $g.DrawLine($p, 320, 420, 320, 160); $g.DrawLine($p, 320, 160, 520, 60)
  $g.FillRectangle((Brush "#eceff1"), 250, 300, 140, 120) } "vent connector up to the flue, slope and clearances"
Photo "wh-tp-valve.jpg" "#cfd8dc" { param($g)
  $g.FillRectangle((Brush "#eceff1"), 120, 40, 200, 380); $g.FillRectangle((Brush "#ffb300"), 320, 140, 70, 40)
  $p = New-Object System.Drawing.Pen ([System.Drawing.Color]::Peru), 16; $g.DrawLine($p, 390, 160, 470, 160); $g.DrawLine($p, 470, 160, 470, 400) } "T&P relief valve and its discharge pipe to the floor"
Photo "permit-sticker.jpg" "#f5f5f5" { param($g)
  $g.FillRectangle((Brush "#2e7d32"), 160, 90, 320, 220); $f = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
  $g.DrawString("CITY OF AUSTIN", $f, [System.Drawing.Brushes]::White, 200, 120); $g.DrawString("PERMIT BP-2026-004512", (New-Object System.Drawing.Font "Consolas", 16), [System.Drawing.Brushes]::White, 190, 180); $g.DrawString("INSPECTION PASSED", $f, [System.Drawing.Brushes]::White, 190, 230) } "permit and inspection sticker on the heater"
