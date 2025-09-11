import sharp from 'sharp';

class FuelImageGenerator {
  constructor() {
    // No initialization needed for Sharp
  }

  // Create a simple fuel image using SVG and Sharp
  async generateFuelImage(fuelType, tokenSymbol) {
    try {
      // Create SVG content
      const svg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#1a1a1a;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#2d1b00;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#1a0f00;stop-opacity:1" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          <!-- Background -->
          <rect width="400" height="300" fill="url(#bg)"/>
          
          <!-- Flame shapes -->
          <path d="M200,250 Q170,200 180,150 Q190,100 200,80 Q210,100 220,150 Q230,200 200,250" 
                fill="#ff4500" opacity="0.8" filter="url(#glow)"/>
          <path d="M200,250 Q175,210 185,170 Q195,130 200,110 Q205,130 215,170 Q225,210 200,250" 
                fill="#ff6500" opacity="0.9" filter="url(#glow)"/>
          <path d="M200,250 Q180,220 188,190 Q196,160 200,140 Q204,160 212,190 Q220,220 200,250" 
                fill="#ff8500" opacity="1.0" filter="url(#glow)"/>
          
          <!-- Sparkles -->
          <circle cx="150" cy="200" r="2" fill="#ffffff" opacity="0.8"/>
          <circle cx="250" cy="180" r="1.5" fill="#ffffff" opacity="0.6"/>
          <circle cx="180" cy="160" r="1" fill="#ffffff" opacity="0.7"/>
          <circle cx="220" cy="170" r="2.5" fill="#ffffff" opacity="0.5"/>
          <circle cx="160" cy="220" r="1.2" fill="#ffffff" opacity="0.9"/>
          <circle cx="240" cy="200" r="1.8" fill="#ffffff" opacity="0.4"/>
          
          <!-- Fuel type text -->
          <text x="200" y="100" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" 
                font-size="48" font-weight="bold" filter="url(#glow)">${fuelType}</text>
          
          <!-- Token symbol -->
          <text x="200" y="140" text-anchor="middle" fill="#ffcc00" font-family="Arial, sans-serif" 
                font-size="24" font-weight="bold" filter="url(#glow)">#${tokenSymbol}</text>
          
          <!-- FUELED text -->
          <text x="200" y="180" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" 
                font-size="20" font-weight="bold" filter="url(#glow)">FUELED</text>
          
          <!-- Oracle branding -->
          <text x="200" y="280" text-anchor="middle" fill="#00bfff" font-family="Arial, sans-serif" 
                font-size="16" font-weight="bold" filter="url(#glow)">@degen_oracle1</text>
        </svg>
      `;

      // Convert SVG to PNG using Sharp
      const pngBuffer = await sharp(Buffer.from(svg))
        .png()
        .toBuffer();

      // Convert to data URL
      const dataURL = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      return dataURL;
    } catch (error) {
      console.error('Error generating fuel image:', error);
      return null;
    }
  }

  // Generate and return image as data URL
  async generateFuelImageDataURL(fuelType, tokenSymbol) {
    try {
      const dataURL = await this.generateFuelImage(fuelType, tokenSymbol);
      return dataURL;
    } catch (error) {
      console.error('Error generating fuel image:', error);
      return null;
    }
  }
}

export default FuelImageGenerator;
