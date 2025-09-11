import { createCanvas, loadImage } from 'canvas';

class FuelImageGenerator {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  // Create a dynamic flame image with fuel amount
  generateFuelImage(fuelType, tokenSymbol) {
    // Create canvas
    const canvas = createCanvas(400, 300);
    const ctx = canvas.getContext('2d');

    // Background gradient (dark to orange)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(0.5, '#2d1b00');
    gradient.addColorStop(1, '#1a0f00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw multiple flame layers for depth
    this.drawFlameLayer(ctx, 200, 250, 80, '#ff4500', 0.8); // Outer flame
    this.drawFlameLayer(ctx, 200, 250, 60, '#ff6500', 0.9); // Middle flame
    this.drawFlameLayer(ctx, 200, 250, 40, '#ff8500', 1.0); // Inner flame

    // Add sparkles/particles
    this.drawSparkles(ctx);

    // Add fuel type text with glow effect
    this.drawTextWithGlow(ctx, fuelType, 200, 100, 'bold 48px Arial', '#ffffff', '#ff4500');

    // Add token symbol
    this.drawTextWithGlow(ctx, `#${tokenSymbol}`, 200, 140, 'bold 24px Arial', '#ffcc00', '#ff6500');

    // Add "FUELED" text
    this.drawTextWithGlow(ctx, 'FUELED', 200, 180, 'bold 20px Arial', '#ffffff', '#ff4500');

    // Add oracle branding
    this.drawTextWithGlow(ctx, '@degen_oracle1', 200, 280, 'bold 16px Arial', '#00bfff', '#0066cc');

    return canvas.toDataURL('image/png');
  }

  // Draw a single flame layer
  drawFlameLayer(ctx, x, y, size, color, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    
    // Create flame shape using bezier curves
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Left side of flame
    ctx.bezierCurveTo(x - size * 0.3, y - size * 0.2, x - size * 0.5, y - size * 0.4, x - size * 0.2, y - size * 0.6);
    ctx.bezierCurveTo(x - size * 0.1, y - size * 0.7, x - size * 0.2, y - size * 0.8, x, y - size * 0.9);
    
    // Right side of flame
    ctx.bezierCurveTo(x + size * 0.2, y - size * 0.8, x + size * 0.1, y - size * 0.7, x + size * 0.2, y - size * 0.6);
    ctx.bezierCurveTo(x + size * 0.5, y - size * 0.4, x + size * 0.3, y - size * 0.2, x, y);
    
    ctx.closePath();
    ctx.fill();
    
    // Add inner glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fill();
    
    ctx.restore();
  }

  // Draw sparkles/particles around the flame
  drawSparkles(ctx) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    
    for (let i = 0; i < 15; i++) {
      const x = 200 + (Math.random() - 0.5) * 200;
      const y = 200 + (Math.random() - 0.5) * 100;
      const size = Math.random() * 3 + 1;
      
      ctx.globalAlpha = Math.random() * 0.8 + 0.2;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  // Draw text with glow effect
  drawTextWithGlow(ctx, text, x, y, font, color, glowColor) {
    ctx.save();
    
    // Set font
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    // Draw main text
    ctx.shadowBlur = 0;
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }

  // Generate and return image as data URL
  async generateFuelImageDataURL(fuelType, tokenSymbol) {
    try {
      const dataURL = this.generateFuelImage(fuelType, tokenSymbol);
      return dataURL;
    } catch (error) {
      console.error('Error generating fuel image:', error);
      return null;
    }
  }
}

export default FuelImageGenerator;
