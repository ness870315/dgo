# Twitter Endpoints Test Script (PowerShell)
# Tests the Twitter search endpoints to troubleshoot functionality

param(
    [string]$BaseUrl = "https://api.degen-oracle.com"
)

Write-Host "🚀 Twitter Endpoints Test Suite" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [bool]$ExpectedSuccess = $true
    )

    Write-Host "`n🧪 Testing $Name..." -ForegroundColor Yellow
    Write-Host "URL: $Url" -ForegroundColor Gray

    try {
        $startTime = Get-Date
        $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 30
        $duration = ((Get-Date) - $startTime).TotalMilliseconds

        Write-Host "✅ Status: $($response.StatusCode) ($([math]::Round($duration))ms)" -ForegroundColor Green

        $data = $response.Content | ConvertFrom-Json
        Write-Host "📊 Response:" -ForegroundColor Blue
        $data | ConvertTo-Json -Depth 3 | Write-Host

        if ($ExpectedSuccess) {
            if ($data.success) {
                Write-Host "🎉 SUCCESS: $Name is working!" -ForegroundColor Green
            } else {
                Write-Host "⚠️  PARTIAL: Endpoint responded but success=false" -ForegroundColor Yellow
                Write-Host "Error: $($data.error)" -ForegroundColor Red
            }
        }

        return $data
    } catch {
        Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            try {
                $errorData = $_.Exception.Response.GetResponseStream() | ConvertFrom-Json
                Write-Host "Response:" -ForegroundColor Red
                $errorData | ConvertTo-Json -Depth 2 | Write-Host
            } catch {
                Write-Host "Could not parse error response" -ForegroundColor Gray
            }
        }
        return $null
    }
}

# Test main backend health
Test-Endpoint -Name "Main Backend Health" -Url "$BaseUrl/health"

# Test Twitter search endpoints
$tests = @(
    @{
        Name = "Twitter Search - Bitcoin"
        Url = "$BaseUrl/api/twitter/search?q=bitcoin`&count=3"
        ExpectedSuccess = $true
    },
    @{
        Name = "Twitter Search - Crypto"
        Url = "$BaseUrl/api/twitter/search?q=crypto`&count=2"
        ExpectedSuccess = $true
    },
    @{
        Name = "Twitter Search - Empty Query"
        Url = "$BaseUrl/api/twitter/search"
        ExpectedSuccess = $false
    },
    @{
        Name = "Twitter User Tweets"
        Url = "$BaseUrl/api/twitter/user/elonmusk/tweets?count=2"
        ExpectedSuccess = $true
    },
    @{
        Name = "Twitter Mentions"
        Url = "$BaseUrl/api/twitter/mentions/bitcoin?count=2"
        ExpectedSuccess = $true
    }
)

foreach ($test in $tests) {
    Test-Endpoint -Name $test.Name -Url $test.Url -ExpectedSuccess $test.ExpectedSuccess
}

Write-Host "`n🎯 Test Suite Complete!" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
}
