/**
 * Manual Token Image Update Script
 * Updates the icon for a specific token by contract address
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TARGET_CONTRACT = 'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
const NEW_IMAGE_URL = process.argv[2]; // Pass image URL as command line argument

if (!NEW_IMAGE_URL || NEW_IMAGE_URL === 'undefined') {
  console.error('❌ Please provide the new image URL as an argument!');
  console.log('\n📝 Usage: node update-token-image.js <IMAGE_URL>');
  console.log('📝 Example: node update-token-image.js https://i.imgur.com/abc123.png\n');
  process.exit(1);
}

async function updateTokenImage() {
  try {
    // Determine cache path
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    const cachePath = path.join(dataDir, 'cache', 'tokens-cache.json');
    
    console.log(`📁 Reading cache from: ${cachePath}`);
    
    // Read existing cache
    const data = await fs.readFile(cachePath, 'utf8');
    const tokens = JSON.parse(data);
    
    console.log(`📊 Total tokens in cache: ${tokens.length}`);
    
    // Find the token by contract address
    const tokenIndex = tokens.findIndex(t => 
      t.contractAddress && 
      t.contractAddress.toLowerCase() === TARGET_CONTRACT.toLowerCase()
    );
    
    if (tokenIndex === -1) {
      console.error(`❌ Token with contract ${TARGET_CONTRACT} not found in cache!`);
      return;
    }
    
    const token = tokens[tokenIndex];
    console.log(`✅ Found token: ${token.symbol} (${token.name})`);
    console.log(`📷 Current image: ${token.jupiterData?.icon || 'none'}`);
    
    // Update the image
    if (!token.jupiterData) {
      token.jupiterData = {};
    }
    
    const oldImage = token.jupiterData.icon;
    token.jupiterData.icon = NEW_IMAGE_URL;
    
    tokens[tokenIndex] = token;
    
    console.log(`🔄 Updating image...`);
    console.log(`   Old: ${oldImage}`);
    console.log(`   New: ${NEW_IMAGE_URL}`);
    
    // Atomic write with backup
    const backupPath = cachePath + '.backup';
    const tempPath = cachePath + '.tmp';
    
    // Create backup
    await fs.copyFile(cachePath, backupPath);
    console.log(`💾 Backup created: ${backupPath}`);
    
    // Write to temp file
    await fs.writeFile(tempPath, JSON.stringify(tokens, null, 2), 'utf8');
    
    // Atomic rename
    await fs.rename(tempPath, cachePath);
    
    console.log(`✅ Successfully updated image for ${token.symbol}!`);
    console.log(`🎯 Contract: ${TARGET_CONTRACT}`);
    console.log(`🖼️ New image: ${NEW_IMAGE_URL}`);
    
  } catch (error) {
    console.error('❌ Error updating token image:', error);
    throw error;
  }
}

// Run the update
updateTokenImage();

