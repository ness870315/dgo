# Simple Twitter API Test (PowerShell)
# Quick test to check if Twitter search endpoint is working

param(
    [string]$BaseUrl = "https://api.degen-oracle.com",
    [string]$Query = "bitcoin",
    [int]$Count = 2
)

$Url = "$BaseUrl/api/twitter/search?q=$Query&count=$Count"

Write-Host "🧪 Testing Twitter Search API..." -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host "─" * 50 -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 10

    Write-Host "📊 Status: $($response.StatusCode)" -ForegroundColor Green

    Write-Host "`n📄 Response Body:" -ForegroundColor Yellow
    try {
        $jsonData = $response.Content | ConvertFrom-Json
        $jsonData | ConvertTo-Json -Depth 3 | Write-Host
    } catch {
        Write-Host "Raw response:" -ForegroundColor Red
        $response.Content | Write-Host
    }

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red

        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorContent = $reader.ReadToEnd()
            Write-Host "Error Response:" -ForegroundColor Red
            $errorContent | Write-Host
        } catch {
            Write-Host "Could not read error response" -ForegroundColor Gray
        }
    }
}
