$body = @"
{
  "tokenData": {
    "symbol": "SSX",
    "name": "Solana Stock Index",
    "contractAddress": "2EyNf2PCNT7eQ9ag1RDXw3qn3Cy22WdTA9T6HKDebonk"
  },
  "paymentData": {
    "validated": true,
    "paymentId": "manual_payment_ssx_20250903",
    "amount": 9500,
    "status": "completed",
    "timestamp": "2025-01-03T12:00:00.000Z"
  }
}
"@

Write-Host "Adding SSX token manually..."

$response = Invoke-RestMethod -Uri "https://api.degen-oracle.com/api/tokens/add-paid-token" -Method Post -ContentType "application/json" -Body $body

Write-Host "Response received:"
$response | ConvertTo-Json -Depth 3
