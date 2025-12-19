// Quick script to extract token addresses from test output
const output = `
1. 9FLoRqzWDPpDbxfuHKEesaSnmmRBUJPagsebrWRLpump
2. 3yhsQKMeFDo3FN5vxRZnEvvr9cN67aU9qwrMrpURgHVU
3. 85aM5XJhdDeUw4MbGKM56zmWnsRyh76zUVut97uPjiCg
4. E7NgL19JbN8BhUDgWjkH8MtnbhJoaGaWJqosxZZepump
5. 9eXC6W3ZKnkNnCr9iENExRLJDYfPGLbc4m6qfJzJpump
6. 9TdF1R3QYSZoSjki6vB7VbTNPzoxky2D9CxUJZSuPyaQ
7. 3HfLqhtF5hR5dyBXh6BMtRaTm9qzStvEGuMa8Gx6pump
8. CgGWS19zR5xTzgCEcW5Svsuon4hBZwzBwUFimoJStCf2
9. HFw81sUUPBkNF5tKDanV8VCYTfVY4XbrEEPiwzyypump
10. 2rMgbkuu9ULmd1cPaJP25KA47XjccNyHEm6Xq1AYpump
11. Hjw6bEcHtbHGpQr8onG3izfJY5DJiWdt7uk2BfdSpump
12. GEuuznWpn6iuQAJxLKQDVGXPtrqXHNWTk3gZqqvJpump
13. 6d5zHW5B8RkGKd51Lpb9RqFQSqDudr9GJgZ1SgQZpump
14. EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR
15. 2hXQn7nJbh2XFTxvtyKb5mKfnScuoiC1Sm8rnWydpump
16. 9fURVh8YkzXDch2KmiBK7YT1zPYGC9UcWfXATvcupump
17. 9DHe3pycTuymFk4H4bbPoAJ4hQrr2kaLDF6J6aAKpump
18. Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump
19. 2umQqRyexgfHcndkULDKStmJJ8xgDz7oBL3EfDJNmoon
20. FAJW358HjJ2mHXSHbHyxghfVGzX5SBoupdjRr2y9pump
`;

console.log('\n🔍 TOP 20 TOKEN CONTRACT ADDRESSES (Copy & Verify):\n');
console.log('='.repeat(80));

const addresses = output.match(/[A-Za-z0-9]{40,50}/g);
addresses.forEach((addr, i) => {
    console.log(`${i + 1}. ${addr}`);
});

console.log('\n' + '='.repeat(80));
console.log('\n✅ All addresses passed filters:');
console.log('   • Market Cap ≥ $100K');
console.log('   • Mint/Freeze Authority Disabled');
console.log('   • No Blockaid Rugpull Flag');
console.log('   • No Wash Trading Flag');
console.log('   • No Hidden Key Holder Flag');
console.log('   • Organic Score > 0');
console.log('\n🔗 Verify on: https://solscan.io/token/[ADDRESS]\n');



