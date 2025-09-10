import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const BubbleMap = ({ tokens, fueledTokens = [], onTokenSelect }) => {
  const svgRef = useRef();
  const tooltipRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const handleResize = () => {
      const container = svgRef.current?.parentElement;
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Responsive sizing based on screen size
        const isMobile = window.innerWidth < 640; // sm breakpoint
        const isTablet = window.innerWidth >= 640 && window.innerWidth < 1024; // lg breakpoint
        
        let minHeight = 400; // Mobile default
        if (isTablet) minHeight = 500;
        else if (!isMobile && !isTablet) minHeight = 600; // Desktop
        
        setDimensions({
          width: containerWidth,
          height: Math.max(minHeight, containerHeight)
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!tokens || tokens.length === 0) return;

    // Debug: Log sample token data to check consistency
    console.log('🫧 BubbleMap Debug - Sample token data:', {
      symbol: tokens[0]?.symbol,
      overallScore: tokens[0]?.overallScore,
      score: tokens[0]?.score,
      mentions: tokens[0]?.mentions,
      twitterMentions: tokens[0]?.twitterData?.mentions,
      communityScore: tokens[0]?.communityScore
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create scales with dynamic sizing based on token count and screen size
    const tokenCount = tokens.length;
    const isMobile = window.innerWidth < 640;
    const isTablet = window.innerWidth >= 640 && window.innerWidth < 1024;
    
    // Adjust base sizes for different screen sizes
    let baseSize = tokenCount <= 10 ? 60 : tokenCount <= 25 ? 40 : tokenCount <= 50 ? 25 : 15;
    if (isMobile) baseSize *= 0.7; // Smaller bubbles on mobile
    else if (isTablet) baseSize *= 0.85; // Medium bubbles on tablet
    
    const maxSize = Math.min(isMobile ? 50 : isTablet ? 65 : 80, baseSize + 20);
    const minSize = Math.max(6, baseSize - 10);
    
    const radiusScale = d3.scaleSqrt()
      .domain(d3.extent(tokens, d => d.score || d.overallScore || 5))
      .range([minSize, maxSize]);

    // Create custom temperature color scale (green = strong, purple = risky)
    const temperatureColorScale = d3.scaleLinear()
      .domain([0, 2, 4, 6, 8, 10]) // Score ranges
      .range(['#9333ea', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']) // Purple to Green
      .interpolate(d3.interpolateRgb);
    
    const colorScale = (score) => temperatureColorScale(score || 0);

    // Create force simulation with dynamic strength
    const chargeStrength = tokenCount <= 10 ? -300 : tokenCount <= 25 ? -150 : tokenCount <= 50 ? -80 : -50;
    const centerStrength = tokenCount <= 10 ? 0.05 : tokenCount <= 25 ? 0.08 : 0.1;
    
    const simulation = d3.forceSimulation(tokens)
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(innerWidth / 2, innerHeight / 2))
      .force('collision', d3.forceCollide().radius(d => radiusScale(d.score || d.overallScore || 5) + 2))
      .force('x', d3.forceX(innerWidth / 2).strength(centerStrength))
      .force('y', d3.forceY(innerHeight / 2).strength(centerStrength));

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create bubbles
    const bubbles = g.selectAll('.bubble')
      .data(tokens)
      .enter()
      .append('g')
      .attr('class', 'bubble')
      .style('cursor', 'pointer');

    // Add circles
    bubbles.append('circle')
      .attr('r', d => radiusScale(d.score || d.overallScore || 5))
              .attr('fill', d => colorScale(d.score || d.overallScore || 5))
      .attr('stroke', '#9945FF')
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    // Add fire icons and pulsing effects for fueled tokens
    console.log('🔥 Fuel Token Debug: fueledTokens =', fueledTokens);
    bubbles.each(function(d) {
      // Handle the wrapped data structure from the API
      const fueledTokensArray = fueledTokens.value || fueledTokens;
      console.log('🔥 Fuel Token Debug: fueledTokensArray =', fueledTokensArray);
      
      const isFueled = fueledTokensArray.some(fueled => 
        fueled.symbol?.toLowerCase() === d.symbol?.toLowerCase()
      );
      
      console.log(`🔥 Fuel Token Debug: Token ${d.symbol} isFueled =`, isFueled);
      
      if (isFueled) {
        console.log(`🔥 Adding fire icon to ${d.symbol}`);
        const bubble = d3.select(this);
        const circle = bubble.select('circle');
        
        // Add pulsing animation class to the circle (bubble)
        circle.classed('fueled-token-pulse', true);
        
        // Enhance the circle with additional styling for fueled tokens
        circle
          .attr('stroke', '#9945FF')
          .attr('stroke-width', 4)
          .style('filter', 'drop-shadow(0 0 15px rgba(255, 69, 0, 0.8))');
        
        // Mark this token as fueled so we can add the fire icon after text is rendered
        d.isFueled = true;
      }
    });
    
    // Add event handlers to the group (g) element instead of circle to avoid conflicts
    bubbles
      .on('mouseover', function(event, d) {
        const circle = d3.select(this).select('circle');
        const currentRadius = radiusScale(d.score || d.overallScore || 5);
        
        // Enhanced hover animation: scale up + glow + bounce
        circle
          .transition()
          .duration(150)
          .ease(d3.easeBackOut.overshoot(1.5))
          .attr('r', currentRadius * 1.3) // Scale up 30%
          .attr('opacity', 1)
          .attr('stroke-width', 4)
          .attr('filter', 'drop-shadow(0 0 8px rgba(153, 69, 255, 0.6))'); // Glow effect
        
        // Store original position and set hover state for magnetic effect
        d.originalX = d.x;
        d.originalY = d.y;
        d.isHovered = true;

        const tooltip = d3.select(tooltipRef.current);
        
        // Format market cap
        const formatMarketCap = (marketCap) => {
          // Handle invalid market cap values
          if (!marketCap || isNaN(marketCap) || marketCap === 0) return '$0';
          
          // Convert to number if it's a string
          const numMarketCap = Number(marketCap);
          if (isNaN(numMarketCap)) return '$0';
          
          if (numMarketCap >= 1e9) return `$${(numMarketCap / 1e9).toFixed(1)}B`;
          if (numMarketCap >= 1e6) return `$${(numMarketCap / 1e6).toFixed(1)}M`;
          if (numMarketCap >= 1e3) return `$${(numMarketCap / 1e3).toFixed(1)}K`;
          return `$${numMarketCap.toFixed(0)}`;
        };
        
        // Format price
        const formatPrice = (price) => {
          // Handle invalid price values
          if (!price || isNaN(price) || price === 0) return '$0';
          
          // Convert to number if it's a string
          const numPrice = Number(price);
          if (isNaN(numPrice)) return '$0';
          
          if (numPrice >= 1) return `$${numPrice.toFixed(4)}`;
          if (numPrice >= 0.01) return `$${numPrice.toFixed(6)}`;
          return `$${numPrice.toExponential(2)}`;
        };
        
        // Get hype level and color based on score
        const getHypeLevel = (score) => {
          if (!score || score >= 8) return { level: 'VIRAL', color: '#a855f7', icon: '🚀' };
          if (score >= 6) return { level: 'TRENDING', color: '#f97316', icon: '🔥' };
          if (score >= 4) return { level: 'BUILDING', color: '#3b82f6', icon: '📈' };
          return { level: 'SLEEPING', color: '#6b7280', icon: '😴' };
        };

        const hypeData = getHypeLevel(d.score || d.overallScore || 0);
        
        // Position tooltip closer to the bubble using SVG coordinates
        const svgRect = svg.node().getBoundingClientRect();
        const bubbleRadius = radiusScale(d.score || d.overallScore || 5);
        const bubbleScreenX = svgRect.left + d.x + margin.left;
        const bubbleScreenY = svgRect.top + d.y + margin.top;
        
        // Smart positioning to avoid going off-screen - position much closer to bubble
        const tooltipWidth = 250; // Estimated tooltip width
        const tooltipHeight = 120; // Estimated tooltip height
        
        let tooltipX = bubbleScreenX + bubbleRadius + 5; // Reduced gap from 10 to 5
        let tooltipY = bubbleScreenY - tooltipHeight/2; // Center tooltip vertically with bubble
        
        // If tooltip goes off right edge, position it to the left of bubble
        if (tooltipX + tooltipWidth > window.innerWidth) {
          tooltipX = bubbleScreenX - bubbleRadius - tooltipWidth - 5; // Reduced gap
        }
        
        // If tooltip goes off top edge, position it below bubble
        if (tooltipY < 0) {
          tooltipY = bubbleScreenY + bubbleRadius + 5; // Reduced gap
        }
        
        // If tooltip goes off bottom edge, position it above bubble
        if (tooltipY + tooltipHeight > window.innerHeight) {
          tooltipY = bubbleScreenY - bubbleRadius - tooltipHeight - 5; // Reduced gap
        }
        
        tooltip.style('display', 'block')
          .style('left', tooltipX + 'px')
          .style('top', tooltipY + 'px')
          .html(`
            <div class="font-bold text-solana-purple">${d.symbol}</div>
            <div class="text-xs text-gray-300">${d.name || d.symbol}</div>
            <div class="text-sm mt-1 flex items-center">
              <span>Score: ${(d.overallScore || d.score) ? (d.overallScore || d.score).toFixed(1) : 'N/A'}/10</span>
              <span class="ml-2 px-2 py-0.5 rounded text-xs font-medium" style="background-color: ${hypeData.color}20; color: ${hypeData.color}; border: 1px solid ${hypeData.color}40;">
                ${hypeData.icon} ${hypeData.level}
              </span>
            </div>
            <div class="text-sm">Market Cap: ${formatMarketCap(d.jupiterData?.mcap || d.marketCap || 0)}</div>
            <div class="text-sm">Price: ${formatPrice(d.jupiterData?.usdPrice || d.currentPrice || d.price || 0)}</div>
            <div class="text-sm">Mentions: ${d.twitterData?.mentions || d.mentions || 0}</div>
            <div class="text-sm">Community: ${d.communityScore ? d.communityScore.toFixed(1) : 'N/A'}/10</div>
          `);
      })
      .on('mouseout', function(event, d) {
        const circle = d3.select(this).select('circle');
        const currentRadius = radiusScale(d.score);
        
        // Smooth return to original state
        circle
          .transition()
          .duration(200)
          .ease(d3.easeCircleOut)
          .attr('r', currentRadius) // Return to original size
          .attr('opacity', 0.8)
          .attr('stroke-width', 2)
          .attr('filter', null); // Remove glow
        
        // Reset position and hover state (for magnetic effect)
        d.isHovered = false;
        if (d.originalX !== undefined) {
          d.x = d.originalX;
          d.y = d.originalY;
        }

        d3.select(tooltipRef.current).style('display', 'none');
      })
      .call(d3.drag()
        .on('start', function(event, d) {
          // Prevent any hover effects during drag
          d.isHovered = false;
          
          // Store the initial drag position
          d.isDragging = true;
          d.wasDragged = false; // Track if actually dragged
          d.dragStartX = d.x;
          d.dragStartY = d.y;
          
          // Restart the simulation to make dragging responsive
          if (!event.active) simulation.alphaTarget(0.3).restart();
          
          // Fix the position of this node during drag
          d.fx = d.x;
          d.fy = d.y;
          
          // Add visual feedback to the circle
          d3.select(this).select('circle')
            .transition()
            .duration(100)
            .attr('stroke-width', 6)
            .attr('filter', 'drop-shadow(0 0 15px rgba(153, 69, 255, 0.8))');
        })
        .on('drag', function(event, d) {
          // Mark as dragged if moved more than a few pixels
          const dx = Math.abs(event.x - d.dragStartX);
          const dy = Math.abs(event.y - d.dragStartY);
          if (dx > 5 || dy > 5) {
            d.wasDragged = true;
          }
          
          // Update the fixed position during drag
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', function(event, d) {
          // Cool down the simulation
          if (!event.active) simulation.alphaTarget(0);
          
          // Add bounce effect when drag ends
          const circle = d3.select(this).select('circle');
          const currentRadius = radiusScale(d.score || d.overallScore || 5);
          
          // Bounce animation
          circle
            .transition()
            .duration(300)
            .ease(d3.easeElasticOut.amplitude(1.5).period(0.3))
            .attr('r', currentRadius * 1.2)
            .transition()
            .duration(200)
            .attr('r', currentRadius)
            .attr('stroke-width', 2)
            .attr('filter', null);
          
          // Release the fixed position to allow natural movement
          d.fx = null;
          d.fy = null;
          d.isDragging = false;
          
          // If not actually dragged, treat as click
          if (!d.wasDragged) {
            onTokenSelect(d);
          }
        })
      );

    // Add text labels
    const textLabels = bubbles.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.3em')
      .style('fill', 'white')
      .style('font-size', d => Math.min(radiusScale(d.score || d.overallScore || 5) / 3, 14) + 'px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(d => d.symbol);

    // Add fire icons for fueled tokens after text is rendered
    bubbles.each(function(d) {
      if (d.isFueled) {
        const bubble = d3.select(this);
        const textElement = bubble.select('text');
        
        // Get the actual text dimensions and bubble radius
        const textBBox = textElement.node().getBBox();
        const bubbleRadius = radiusScale(d.score || d.overallScore || 5);
        const fontSize = Math.min(bubbleRadius / 3, 14);
        const fireIconSize = Math.max(fontSize * 0.8, 10);
        
        // Calculate if fire icon would fit next to the text within bubble bounds
        const textRightEdge = textBBox.width / 2 + 3; // Text right edge + gap
        const fireIconWidth = fireIconSize * 0.6; // Approximate fire emoji width
        const totalWidthNeeded = textRightEdge + fireIconWidth;
        
        // Check if the fire icon would exceed bubble bounds (with some padding)
        const bubblePadding = 5; // Safety margin
        const fitsHorizontally = totalWidthNeeded <= (bubbleRadius - bubblePadding);
        
        let fireX, fireY, fireDy, fireAnchor;
        
        if (fitsHorizontally) {
          // Position fire icon to the right of token name (original behavior)
          fireX = textBBox.width / 2 + 3;
          fireY = 0;
          fireDy = '.3em'; // Match token name vertical alignment
          fireAnchor = 'start';
        } else {
          // Position fire icon below token name (new behavior for small bubbles)
          fireX = 0; // Center horizontally
          fireY = textBBox.height / 2 + 2; // Position below text with small gap
          fireDy = '.3em';
          fireAnchor = 'middle';
        }
        
        // Add fire icon with dynamic positioning
        bubble.append('text')
          .attr('class', 'fire-icon')
          .attr('x', fireX)
          .attr('y', fireY)
          .attr('dy', fireDy)
          .attr('text-anchor', fireAnchor)
          .style('font-size', fireIconSize + 'px')
          .style('pointer-events', 'none')
          .style('fill', '#FF4500')
          .style('filter', 'drop-shadow(0 0 3px rgba(255, 69, 0, 0.8))')
          .text('🔥');
      }
    });
    
    // Add subtle pulse animation for high-score tokens (score >= 6)
    bubbles.selectAll('circle')
      .filter(d => (d.score || d.overallScore || 0) >= 6)
      .style('animation', d => {
        const score = d.score || d.overallScore || 0;
        const pulseSpeed = Math.max(0.5, 2 - (score - 6) * 0.3); // Higher score = faster pulse
        return `bubble-pulse ${pulseSpeed}s ease-in-out infinite alternate`;
      });
    
    // Add CSS animation keyframes to the document if not already present
    if (!document.querySelector('#bubble-animations')) {
      const style = document.createElement('style');
      style.id = 'bubble-animations';
      style.textContent = `
        @keyframes bubble-pulse {
          0% { opacity: 0.8; }
          100% { opacity: 0.95; }
        }
        @keyframes bubble-glow {
          0% { filter: drop-shadow(0 0 5px rgba(153, 69, 255, 0.3)); }
          100% { filter: drop-shadow(0 0 12px rgba(153, 69, 255, 0.7)); }
        }
      `;
      document.head.appendChild(style);
    }

    // Mouse tracking for magnetic effect
    let currentMouseX = 0;
    let currentMouseY = 0;
    
    svg.on('mousemove', function(event) {
      const [mouseX, mouseY] = d3.pointer(event);
      currentMouseX = mouseX;
      currentMouseY = mouseY;
    });

    // Update positions on simulation tick with magnetic effect
    simulation.on('tick', () => {
      bubbles.attr('transform', d => {
        let finalX = d.x;
        let finalY = d.y;
        
        // Magnetic effect when bubble is hovered (but not being dragged)
        if (d.isHovered && !d.isDragging) {
          const distanceToMouse = Math.sqrt(
            Math.pow(currentMouseX - d.x, 2) + Math.pow(currentMouseY - d.y, 2)
          );
          
          // Only apply magnetic effect within reasonable distance
          if (distanceToMouse < 150 && distanceToMouse > 5) { // Added minimum distance to prevent jitter
            const magneticStrength = 0.3; // Increased strength for more noticeable effect
            const deltaX = (currentMouseX - d.x) * magneticStrength;
            const deltaY = (currentMouseY - d.y) * magneticStrength;
            
            // Update actual position for magnetic effect
            d.x += deltaX * 0.1; // Apply some of the magnetic force to actual position
            d.y += deltaY * 0.1;
            
            finalX = d.x;
            finalY = d.y;
          }
        }
        
        return `translate(${finalX},${finalY})`;
      });
    });

    return () => {
      simulation.stop();
    };
  }, [tokens, dimensions, onTokenSelect]);

  return (
    <div className="relative w-full h-full bubble-map-container">
      <style>
        {`
          .fueled-token-pulse {
            animation: fuelPulse 1.2s ease-in-out infinite !important;
            filter: drop-shadow(0 0 15px rgba(255, 69, 0, 0.9)) !important;
          }
          
          @keyframes fuelPulse {
            0% { 
              transform: scale(1);
              filter: drop-shadow(0 0 15px rgba(255, 69, 0, 0.9));
            }
            50% { 
              transform: scale(1.2);
              filter: drop-shadow(0 0 30px rgba(255, 69, 0, 1)) drop-shadow(0 0 40px rgba(255, 140, 0, 0.8));
            }
            100% { 
              transform: scale(1);
              filter: drop-shadow(0 0 15px rgba(255, 69, 0, 0.9));
            }
          }
          

        `}
      </style>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
      <div
        ref={tooltipRef}
        className="bubble-tooltip"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default BubbleMap;

