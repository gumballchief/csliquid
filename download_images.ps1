Set-Location 'C:\Users\youso\cs-skin-futures'

$outDir = 'public\images\markets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# All 35 markets: slug -> steam hash name to look up image for
# Index markets use a representative iconic skin for their image
$markets = [ordered]@{
    # Index markets — use iconic representative skins
    'awp-index'    = 'AWP | Lightning Strike (Factory New)'
    'ak47-index'   = 'AK-47 | Redline (Field-Tested)'
    'knife-index'  = ([char]0x2605 + ' Butterfly Knife | Fade (Factory New)')
    'glove-index'  = ([char]0x2605 + ' Sport Gloves | Vice (Factory New)')
    'cs500-index'  = 'AWP | Dragon Lore (Factory New)'
    # Rifles
    'awp-dragon-lore-fn'     = 'AWP | Dragon Lore (Factory New)'
    'awp-gungnir-fn'         = 'AWP | Gungnir (Factory New)'
    'awp-medusa-fn'          = 'AWP | Medusa (Factory New)'
    'awp-asiimov-fn'         = 'AWP | Asiimov (Factory New)'
    'ak47-wild-lotus-fn'     = 'AK-47 | Wild Lotus (Factory New)'
    'ak47-gold-arabesque-fn' = 'AK-47 | Gold Arabesque (Factory New)'
    'ak47-fire-serpent-fn'   = 'AK-47 | Fire Serpent (Factory New)'
    'ak47-case-hardened-fn'  = 'AK-47 | Case Hardened (Factory New)'
    'm4a4-howl-fn'           = 'M4A4 | Howl (Factory New)'
    'm4a4-poseidon-fn'       = 'M4A4 | Poseidon (Factory New)'
    'm4a1s-golden-coil-fn'   = 'M4A1-S | Golden Coil (Factory New)'
    # Pistols
    'glock-fade-fn'          = 'Glock-18 | Fade (Factory New)'
    'desert-eagle-blaze-fn'  = 'Desert Eagle | Blaze (Factory New)'
    'usp-kill-confirmed-fn'  = 'USP-S | Kill Confirmed (Factory New)'
    # Knives
    'karambit-doppler-p2-fn'  = ([char]0x2605 + ' Karambit | Doppler (Factory New)')
    'karambit-fade-fn'        = ([char]0x2605 + ' Karambit | Fade (Factory New)')
    'butterfly-doppler-p1-fn' = ([char]0x2605 + ' Butterfly Knife | Doppler (Factory New)')
    'm9-bayonet-doppler-fn'   = ([char]0x2605 + ' M9 Bayonet | Doppler (Factory New)')
    # Gloves
    'sport-gloves-vice-fn'        = ([char]0x2605 + ' Sport Gloves | Vice (Factory New)')
    'driver-gloves-king-snake-fn' = ([char]0x2605 + ' Driver Gloves | King Snake (Factory New)')
    # Cases
    'dreams-nightmares-case' = 'Dreams & Nightmares Case'
    'recoil-case'            = 'Recoil Case'
    'revolution-case'        = 'Revolution Case'
    'fracture-case'          = 'Fracture Case'
    'snakebite-case'         = 'Snakebite Case'
    'chroma-2-case'          = 'Chroma 2 Case'
    'gamma-case'             = 'Gamma Case'
    'spectrum-case'          = 'Spectrum Case'
    'prisma-2-case'          = 'Prisma 2 Case'
    'cs20-case'              = 'CS20 Case'
}

$apiHeaders = @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    'Accept'     = 'application/json'
}
$imgHeaders = @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    'Referer'    = 'https://steamcommunity.com/'
}

$results = @{}
$ok = 0; $fail = 0

foreach ($entry in $markets.GetEnumerator()) {
    $slug     = $entry.Key
    $hashName = $entry.Value
    $outPath  = "$outDir\$slug.png"

    if ((Test-Path $outPath) -and (Get-Item $outPath).Length -gt 1000) {
        Write-Host "[SKIP] $slug" -ForegroundColor Gray
        $results[$slug] = "/images/markets/$slug.png"
        $ok++; continue
    }

    Write-Host "[FETCH] $slug ..." -NoNewline

    # Query Steam Market search API
    $encoded = [Uri]::EscapeDataString($hashName)
    $apiUrl  = "https://steamcommunity.com/market/search/render/?query=$encoded&appid=730&search_descriptions=0&count=5&currency=1&format=json"

    $iconHash = $null
    try {
        $resp = Invoke-WebRequest -Uri $apiUrl -Headers $apiHeaders -TimeoutSec 20 -UseBasicParsing
        $data = $resp.Content | ConvertFrom-Json
        foreach ($item in $data.results) {
            $desc = $item.asset_description
            if ($desc.market_hash_name -eq $hashName -or $desc.name -eq $hashName) {
                $iconHash = if ($desc.icon_url_large) { $desc.icon_url_large } else { $desc.icon_url }
                break
            }
        }
        # Fallback: first result
        if (-not $iconHash -and $data.results.Count -gt 0) {
            $desc = $data.results[0].asset_description
            $iconHash = if ($desc.icon_url_large) { $desc.icon_url_large } else { $desc.icon_url }
        }
    } catch {
        Write-Host " API_ERR" -ForegroundColor Red
        $results[$slug] = $null; $fail++
        Start-Sleep -Milliseconds 1500
        continue
    }

    if (-not $iconHash) {
        Write-Host " NO_ICON" -ForegroundColor Yellow
        $results[$slug] = $null; $fail++
        Start-Sleep -Milliseconds 500
        continue
    }

    # Download image at 360x360
    $imgUrl = "https://community.cloudflare.steamstatic.com/economy/image/$iconHash/360fx360f"
    try {
        Invoke-WebRequest -Uri $imgUrl -OutFile $outPath -Headers $imgHeaders -TimeoutSec 20 -UseBasicParsing | Out-Null
        $size = (Get-Item $outPath).Length
        if ($size -gt 1000) {
            Write-Host " OK (${size}b)" -ForegroundColor Green
            $results[$slug] = "/images/markets/$slug.png"
            $ok++
        } else {
            Write-Host " TOO_SMALL (${size}b)" -ForegroundColor Yellow
            Remove-Item $outPath -Force -EA SilentlyContinue
            $results[$slug] = $null; $fail++
        }
    } catch {
        Write-Host " DL_ERR" -ForegroundColor Red
        $results[$slug] = $null; $fail++
    }

    Start-Sleep -Milliseconds 1000
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "Downloaded: $ok / $($markets.Count)" -ForegroundColor Cyan
if ($fail -gt 0) { Write-Host "Failed: $fail" -ForegroundColor Yellow }

# Save JSON for patch script
$results | ConvertTo-Json | Out-File 'image_results.json' -Encoding UTF8
Write-Host "Saved image_results.json" -ForegroundColor Green
Write-Host ""
Write-Host "DONE — now run update_allmarkets.ps1 to patch allMarkets.ts" -ForegroundColor Green
Read-Host "Press Enter to close"
