# Quick PowerShell script to test the decoder endpoint

$API_BASE = "https://api.degen-oracle.com"

Write-Host "🧪 Testing Decoder Endpoint`n"
Write-Host ("=" * 80)

# Test USELESS CPMM pool
$body = @{
    poolAddress = "Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp"
    programId = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
} | ConvertTo-Json

Write-Host "`n📊 Testing USELESS CPMM Pool..."
Write-Host "   Pool: Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp"

try {
    $response = Invoke-RestMethod -Uri "$API_BASE/api/decoders/test" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "`n✅ Response received:`n"
    $response | ConvertTo-Json -Depth 10
    
    if ($response.success) {
        Write-Host "`n✅ SUCCESS! Pool decoded correctly`n" -ForegroundColor Green
        Write-Host "   Decoder: $($response.decoderType)"
        Write-Host "   Elapsed: $($response.elapsedMs)ms"
        Write-Host "   Token0 Vault: $($response.poolData.token0Vault)"
        Write-Host "   Token1 Vault: $($response.poolData.token1Vault)"
    } else {
        Write-Host "`n❌ FAILED to decode pool`n" -ForegroundColor Red
        Write-Host "   Decoder: $($response.decoderType)"
        Write-Host "   Metrics: $($response.decoderMetrics | ConvertTo-Json)"
    }
    
} catch {
    Write-Host "`n❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "`nResponse: $responseBody"
    }
}

Write-Host "`n" + ("=" * 80)

# Also show current stats
Write-Host "`n📊 Current Decoder Stats:`n"
try {
    $statsResponse = Invoke-RestMethod -Uri "$API_BASE/api/decoders/stats" -TimeoutSec 30
    $stats = $statsResponse.data
    
    Write-Host "   CPMM Usage: $($stats.raydiumCPMM.usage)"
    Write-Host "   CPMM Total Decodes: $($stats.raydiumCPMM.totalDecodes)"
    Write-Host "   CPMM Success Rate: $($stats.raydiumCPMM.successRate)"
    Write-Host "   CPMM Cache Size: $($stats.raydiumCPMM.cacheSize)"
    
} catch {
    Write-Host "   ❌ Could not fetch stats: $($_.Exception.Message)" -ForegroundColor Red
}

