import sharp from 'sharp';

class FuelImageGenerator {
  constructor() {
    // No initialization needed for Sharp
  }

  // Create a simple fuel image using SVG and Sharp
  async generateFuelImage(fuelType, tokenSymbol) {
    try {
      // Create SVG content - X requires 1200x630 for link previews
      const svg = `
        <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
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
          <rect width="1200" height="630" fill="url(#bg)"/>
          
          <!-- Flame shapes (scaled up) -->
          <path d="M600,525 Q510,420 540,315 Q570,210 600,168 Q630,210 660,315 Q690,420 600,525" 
                fill="#ff4500" opacity="0.8" filter="url(#glow)"/>
          <path d="M600,525 Q525,441 555,357 Q585,273 600,231 Q615,273 645,357 Q675,441 600,525" 
                fill="#ff6500" opacity="0.9" filter="url(#glow)"/>
          <path d="M600,525 Q540,462 564,399 Q588,336 600,294 Q612,336 636,399 Q660,462 600,525" 
                fill="#ff8500" opacity="1.0" filter="url(#glow)"/>
          
          <!-- Sparkles (scaled up) -->
          <circle cx="450" cy="420" r="6" fill="#ffffff" opacity="0.8"/>
          <circle cx="750" cy="378" r="4.5" fill="#ffffff" opacity="0.6"/>
          <circle cx="540" cy="336" r="3" fill="#ffffff" opacity="0.7"/>
          <circle cx="660" cy="357" r="7.5" fill="#ffffff" opacity="0.5"/>
          <circle cx="480" cy="462" r="3.6" fill="#ffffff" opacity="0.9"/>
          <circle cx="720" cy="420" r="5.4" fill="#ffffff" opacity="0.4"/>
          
          <!-- Fuel type text (scaled up) -->
          <text x="600" y="210" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" 
                font-size="144" font-weight="bold" filter="url(#glow)">${fuelType}</text>
          
          <!-- Token symbol (scaled up) -->
          <text x="600" y="294" text-anchor="middle" fill="#ffcc00" font-family="Arial, sans-serif" 
                font-size="72" font-weight="bold" filter="url(#glow)">#${tokenSymbol}</text>
          
          <!-- FUELED text (scaled up) -->
          <text x="600" y="378" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" 
                font-size="60" font-weight="bold" filter="url(#glow)">FUELED</text>
          
          <!-- Oracle branding (scaled up) -->
          <text x="600" y="588" text-anchor="middle" fill="#00bfff" font-family="Arial, sans-serif" 
                font-size="48" font-weight="bold" filter="url(#glow)">@dgnoracle</text>
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
