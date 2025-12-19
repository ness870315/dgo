import axios from 'axios';

const tokenAddress = 'EHVebVwCTrqvdGLKisU5M5ikW5VHRALx93XvHa7zJLBR';

async function checkToken() {
    try {
        console.log(`\n🔍 Checking token: ${tokenAddress}\n`);
        
        const response = await axios.get(`https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`, {
            timeout: 10000
        });
        
        if (response.data && response.data.length > 0) {
            const tokenData = response.data[0];
            
            console.log('📊 TOKEN DATA:');
            console.log(JSON.stringify(tokenData, null, 2));
            
            console.log('\n🚨 SCAM INDICATORS:');
            console.log(`   Mint Authority Disabled: ${tokenData.audit?.mintAuthorityDisabled}`);
            console.log(`   Freeze Authority Disabled: ${tokenData.audit?.freezeAuthorityDisabled}`);
            console.log(`   Market Cap: $${tokenData.mcap?.toLocaleString() || tokenData.fdv?.toLocaleString() || 'N/A'}`);
            console.log(`   Liquidity: $${tokenData.liquidity?.toLocaleString() || 'N/A'}`);
            console.log(`   Organic Score: ${tokenData.organicScore}`);
            console.log(`   Organic Label: ${tokenData.organicScoreLabel}`);
            console.log(`   Top Holders %: ${tokenData.audit?.topHoldersPercentage}`);
            console.log(`   Blockaid Rugpull: ${tokenData.audit?.blockaidRugpull}`);
            console.log(`   Blockaid Wash Trading: ${tokenData.audit?.blockaidWashTrading}`);
            console.log(`   Blockaid Hidden Key: ${tokenData.audit?.blockaidHiddenKeyHolder}`);
            console.log(`   Is Sus: ${tokenData.audit?.isSus}`);
            
        } else {
            console.log('❌ No data found for this token');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkToken();



