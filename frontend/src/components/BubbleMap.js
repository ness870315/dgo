import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { getStatusFromScore } from '../utils/statusUtils';

const BubbleMap = ({ tokens, liveTokenDataRef, fueledTokens = [], onTokenSelect, currentFilter = {} }) => {
  const svgRef = useRef();
  const tooltipRef = useRef();
  const zoomRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [zoomTransform, setZoomTransform] = useState(d3.zoomIdentity);
  
  // ✅ DEXSCREENER APPROACH: Merge live data from ref
  // Force re-calculation every 2 seconds to pick up live data changes
  const [refreshTick, setRefreshTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick(prev => prev + 1);
    }, 2000); // Refresh every 2 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  const tokensWithLiveData = useMemo(() => {
    if (!tokens || tokens.length === 0) return [];
    if (!liveTokenDataRef || !liveTokenDataRef.current) return tokens;
    
    return tokens.map(token => {
      const address = token.contractAddress || token.tokenAddress;
      const liveData = liveTokenDataRef.current.get(address);
      
      if (liveData) {
        return {
          ...token,
          ...liveData,
          name: token.name,
          symbol: token.symbol,
          logoURI: token.logoURI
        };
      }
      
      return token;
    });
  }, [tokens, liveTokenDataRef, refreshTick]); // Re-run when refreshTick changes

  useEffect(() => {
    const handleResize = () => {
      const container = svgRef.current?.parentElement;
      if (container) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Responsive sizing based on screen size
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const isMobile = screenWidth < 640; // sm breakpoint
        const isTablet = screenWidth >= 640 && screenWidth < 1024; // lg breakpoint
        const isSmallLaptop = screenWidth >= 1024 && screenWidth < 1366; // 14-inch laptops
        const isDesktop = screenWidth >= 1366 && screenWidth < 1440;
        const isLargeDesktop = screenWidth >= 1440 && screenWidth < 1920;
        const isUltraWide = screenWidth >= 1920;
        
        // Calculate available height (accounting for header, filters, etc.)
        const availableHeight = screenHeight - 200; // Reserve space for header and controls
        
        let minHeight = 300; // Mobile default (further reduced)
        if (isTablet) minHeight = 350; // Reduced
        else if (isSmallLaptop) minHeight = 380; // Optimized for 14-inch screens
        else if (isDesktop) minHeight = 420; // Reduced
        else if (isLargeDesktop) minHeight = 500; // Reduced
        else if (isUltraWide) minHeight = 600; // Reduced
        
        // Dynamic height adjustment based on token count
        const tokenCount = tokensWithLiveData?.length || 0;
        let dynamicHeight = Math.min(Math.max(minHeight, containerHeight), availableHeight);
        
        // Increase height for many tokens but cap at available height
        if (tokenCount > 50) {
          dynamicHeight = Math.min(Math.max(dynamicHeight, 600), availableHeight); // Reduced max
        } else if (tokenCount > 30) {
          dynamicHeight = Math.min(Math.max(dynamicHeight, 500), availableHeight); // Reduced max
        } else if (tokenCount > 15) {
          dynamicHeight = Math.min(Math.max(dynamicHeight, 450), availableHeight); // Reduced max
        }
        
        setDimensions({
          width: containerWidth,
          height: dynamicHeight
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!tokensWithLiveData || tokensWithLiveData.length === 0) return;

    const svg = d3.select(svgRef.current);
    
    // Only clear on first render or when dimensions change significantly
    // This prevents the "glitch" on every token update
    if (!svg.select('g.bubbles-container').node()) {
      svg.selectAll("*").remove();
    }

    const { width, height } = dimensions;
    const margin = { top: 80, right: 30, bottom: 60, left: 30 }; // Increased margins for better spacing and natural clustering
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create scales with dynamic sizing based on token count and screen size
    const tokenCount = tokensWithLiveData.length;
    const screenWidth = window.innerWidth;
    const isMobile = screenWidth < 640;
    const isTablet = screenWidth >= 640 && screenWidth < 1024;
    const isSmallLaptop = screenWidth >= 1024 && screenWidth < 1366; // 14-inch laptops
    const isDesktop = screenWidth >= 1366 && screenWidth < 1440;
    const isLargeDesktop = screenWidth >= 1440 && screenWidth < 1920;
    const isUltraWide = screenWidth >= 1920;
    
    // Determine filter type for adaptive sizing
    const getActiveFilter = () => {
      if (currentFilter.trending) return 'trending';
      if (currentFilter.cults) return 'cults';
      if (currentFilter.highCap) return 'highCap';
      if (currentFilter.midCap) return 'midCap';
      if (currentFilter.smallCap) return 'smallCap';
      if (currentFilter.microCap) return 'microCap';
      return 'trending'; // default
    };
    
    const activeFilter = getActiveFilter();
    
    // Base size calculation - adaptive based on filter type (reduced for 14-inch screens)
    let baseSize;
    if (activeFilter === 'trending' || activeFilter === 'cults') {
      // Trending and Cults: Fewer tokens, larger bubbles
      baseSize = tokenCount <= 10 ? 60 : tokenCount <= 25 ? 45 : tokenCount <= 50 ? 30 : 18;
    } else if (activeFilter === 'highCap') {
      // High Cap: Medium number of tokens, medium bubbles
      baseSize = tokenCount <= 15 ? 45 : tokenCount <= 30 ? 35 : tokenCount <= 60 ? 22 : 15;
    } else if (activeFilter === 'midCap') {
      // Mid Cap: More tokens, smaller bubbles
      baseSize = tokenCount <= 20 ? 35 : tokenCount <= 40 ? 25 : tokenCount <= 80 ? 18 : 12;
    } else if (activeFilter === 'smallCap') {
      // Small Cap: Many tokens, smaller bubbles
      baseSize = tokenCount <= 30 ? 30 : tokenCount <= 60 ? 22 : tokenCount <= 120 ? 15 : 9;
    } else if (activeFilter === 'microCap') {
      // Micro Cap: Most tokens, smallest bubbles
      baseSize = tokenCount <= 40 ? 25 : tokenCount <= 80 ? 18 : tokenCount <= 160 ? 12 : 7;
    } else {
      // Default fallback
      baseSize = tokenCount <= 10 ? 45 : tokenCount <= 25 ? 30 : tokenCount <= 50 ? 18 : 12;
    }
    
    // Scale based on screen size - reduced multipliers for high-density filters
    let screenType = 'unknown';
    const isHighDensityFilter = ['midCap', 'smallCap', 'microCap'].includes(activeFilter);
    
    if (isMobile) {
      baseSize *= 0.7; // Reduced for mobile
      screenType = 'mobile';
    } else if (isTablet) {
      baseSize *= 0.8; // Reduced for tablet
      screenType = 'tablet';
    } else if (isSmallLaptop) {
      baseSize *= isHighDensityFilter ? 0.9 : 1.0; // Optimized for 14-inch screens
      screenType = 'small-laptop';
    } else if (isDesktop) {
      baseSize *= isHighDensityFilter ? 1.0 : 1.2; // Reduced for desktop
      screenType = 'desktop';
    } else if (isLargeDesktop) {
      baseSize *= isHighDensityFilter ? 1.1 : 1.4; // Reduced for large desktop
      screenType = 'large-desktop';
    } else if (isUltraWide) {
      baseSize *= isHighDensityFilter ? 1.2 : 1.6; // Reduced for ultra-wide
      screenType = 'ultra-wide';
    }
    

    
    // Set max and min sizes based on screen size and filter type
    let maxSize, minSize;
    
    if (isMobile) {
      maxSize = isHighDensityFilter ? 35 : 45;
      minSize = isHighDensityFilter ? 5 : 6;
    } else if (isTablet) {
      maxSize = isHighDensityFilter ? 45 : 60;
      minSize = isHighDensityFilter ? 6 : 8;
    } else if (isSmallLaptop) {
      maxSize = isHighDensityFilter ? 55 : 70; // Optimized for 14-inch screens
      minSize = isHighDensityFilter ? 7 : 10;
    } else if (isDesktop) {
      maxSize = isHighDensityFilter ? 65 : 90;
      minSize = isHighDensityFilter ? 8 : 12;
    } else if (isLargeDesktop) {
      maxSize = isHighDensityFilter ? 80 : 110;
      minSize = isHighDensityFilter ? 10 : 15;
    } else { // Ultra-wide
      maxSize = isHighDensityFilter ? 95 : 130;
      minSize = isHighDensityFilter ? 12 : 18;
    }
    
    // Ensure base size fits within bounds
    maxSize = Math.min(maxSize, baseSize + 20);
    minSize = Math.max(minSize, baseSize - 10);
    
    const radiusScale = d3.scaleSqrt()
      .domain(d3.extent(tokensWithLiveData, d => d.score || d.overallScore || 5))
      .range([minSize, maxSize]);

    // Create custom temperature color scale (green = strong, purple = risky)
    const temperatureColorScale = d3.scaleLinear()
      .domain([0, 2, 4, 6, 8, 10]) // Score ranges
      .range(['#9333ea', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']) // Purple to Green
      .interpolate(d3.interpolateRgb);
    
    const colorScale = (score) => temperatureColorScale(score || 0);

    // Create force simulation with dynamic strength - optimized for natural clustering
    const chargeStrength = tokenCount <= 10 ? -200 : tokenCount <= 25 ? -100 : tokenCount <= 50 ? -60 : -40;
    const centerStrength = tokenCount <= 10 ? 0.02 : tokenCount <= 25 ? 0.03 : 0.04; // Reduced center force for more natural spread
    
    const simulation = d3.forceSimulation(tokensWithLiveData)
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(innerWidth / 2, innerHeight / 2))
      .force('collision', d3.forceCollide().radius(d => radiusScale(d.score || d.overallScore || 5) + 2))
      .force('x', d3.forceX(innerWidth / 2).strength(centerStrength))
      .force('y', d3.forceY(innerHeight / 2).strength(centerStrength))
      // 🌊 SOFT BOUNDARY: Gentle repulsion from edges for natural clustering
      .force('boundary', function() {
        tokensWithLiveData.forEach(d => {
          const radius = radiusScale(d.score || d.overallScore || 5);
          const boundaryStrength = 0.1; // Gentle repulsion
          const boundaryMargin = radius * 2; // Safe distance from edges
          
          // Top boundary (gentle push down)
          if (d.y < boundaryMargin) {
            d.vy += (boundaryMargin - d.y) * boundaryStrength;
          }
          
          // Bottom boundary (gentle push up)
          if (d.y > innerHeight - boundaryMargin) {
            d.vy -= (d.y - (innerHeight - boundaryMargin)) * boundaryStrength;
          }
          
          // Left boundary (gentle push right)
          if (d.x < boundaryMargin) {
            d.vx += (boundaryMargin - d.x) * boundaryStrength;
          }
          
          // Right boundary (gentle push left)
          if (d.x > innerWidth - boundaryMargin) {
            d.vx -= (d.x - (innerWidth - boundaryMargin)) * boundaryStrength;
          }
        });
      });

    // Get or create the main bubbles container
    let g = svg.select('g.bubbles-container');
    if (g.empty()) {
      g = svg.append('g')
        .attr('class', 'bubbles-container')
        .attr('transform', `translate(${margin.left},${margin.top})`);
      
      // Add zoom functionality only on first creation
      const zoom = d3.zoom()
        .scaleExtent([0.5, 3]) // Allow zoom from 0.5x to 3x
        .on('zoom', (event) => {
          setZoomTransform(event.transform);
          g.attr('transform', `translate(${margin.left},${margin.top}) scale(${event.transform.k}) translate(${event.transform.x},${event.transform.y})`);
        });

      // Store zoom reference for reset function
      zoomRef.current = zoom;
      svg.call(zoom);
    }

    // D3 Enter/Update/Exit pattern for efficient rendering
    // Bind data with key function for proper tracking
    const bubbles = g.selectAll('.bubble')
      .data(tokensWithLiveData, d => d.contractAddress || d.symbol);

    // EXIT: Remove bubbles that no longer exist
    bubbles.exit()
      .transition()
      .duration(300)
      .attr('opacity', 0)
      .remove();

    // ENTER: Create new bubbles
    const bubblesEnter = bubbles.enter()
      .append('g')
      .attr('class', 'bubble')
      .style('cursor', 'pointer')
      .attr('opacity', 0);

    // Add circles to new bubbles
    bubblesEnter.append('circle')
      .attr('r', d => radiusScale(d.score || d.overallScore || 5))
      .attr('fill', d => colorScale(d.score || d.overallScore || 5))
      .attr('stroke', '#9945FF')
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    // Fade in new bubbles
    bubblesEnter
      .transition()
      .duration(300)
      .attr('opacity', 1);

    // MERGE: Combine enter and update selections
    const bubblesAll = bubblesEnter.merge(bubbles);

    // UPDATE: Update existing bubbles (color, size may have changed)
    bubblesAll.select('circle')
      .transition()
      .duration(300)
      .attr('r', d => radiusScale(d.score || d.overallScore || 5))
      .attr('fill', d => colorScale(d.score || d.overallScore || 5));

    // Add fire icons and pulsing effects for fueled tokens
    bubblesAll.each(function(d) {
      // Handle the wrapped data structure from the API
      const fueledTokensArray = fueledTokens.value || fueledTokens;
      
      const isFueled = fueledTokensArray.some(fueled => 
        fueled.symbol?.toLowerCase() === d.symbol?.toLowerCase()
      );
      
      const bubble = d3.select(this);
      const circle = bubble.select('circle');
      
      if (isFueled) {
        // Add pulsing animation class to the circle (bubble)
        circle.classed('fueled-token-pulse', true);
        
        // Enhance the circle with additional styling for fueled tokens
        circle
          .attr('stroke', '#9945FF')
          .attr('stroke-width', 4)
          .style('filter', 'drop-shadow(0 0 15px rgba(255, 69, 0, 0.8))');
        
        // Mark this token as fueled so we can add the fire icon after text is rendered
        d.isFueled = true;
      } else {
        // Reset non-fueled tokens
        circle.classed('fueled-token-pulse', false);
        circle
          .attr('stroke', '#9945FF')
          .attr('stroke-width', 2)
          .style('filter', null);
        d.isFueled = false;
      }
    });
    
    // Add event handlers to the merged selection (handles both new and existing bubbles)
    bubblesAll
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
          
          if (numPrice < 0.0001) return `$${numPrice.toExponential(2)}`;
          if (numPrice < 1) return `$${numPrice.toFixed(6)}`; // 6 decimals for prices < 1
          return `$${numPrice.toFixed(2)}`;
        };
        
        // Get hype level and color based on score using centralized utility
        const getHypeLevel = (score) => {
          return getStatusFromScore(score);
        };

        const hypeData = getHypeLevel(d.score || d.overallScore || 0);
        
        // Position tooltip close to the mouse cursor for better UX
        const tooltipWidth = 280; // Estimated tooltip width (matches CSS max-width)
        const tooltipHeight = 140; // Estimated tooltip height (increased for better spacing)
        
        // Get mouse position relative to viewport
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Position tooltip very close to cursor (prefer top positioning)
        let tooltipX = mouseX + 8; // Small offset to avoid cursor overlap
        let tooltipY = mouseY - tooltipHeight - 8; // Position above cursor with more space
        
        // Smart positioning to avoid going off-screen
        // If tooltip goes off right edge, position it to the left of cursor
        if (tooltipX + tooltipWidth > window.innerWidth) {
          tooltipX = mouseX - tooltipWidth - 8;
        }
        
        // If tooltip goes off top edge, position it below cursor (but still close)
        if (tooltipY < 0) {
          tooltipY = mouseY + 8; // Below cursor, close to it
        }
        
        // If tooltip goes off bottom edge when below cursor, try above again
        if (tooltipY + tooltipHeight > window.innerHeight && tooltipY > mouseY) {
          tooltipY = mouseY - tooltipHeight - 8; // Above cursor
        }
        
        tooltip.style('display', 'block')
          .style('left', tooltipX + 'px')
          .style('top', tooltipY + 'px')
          .html(`
            <div class="font-bold text-solana-purple flex items-center gap-2">
              ${d.symbol}
              <span class="text-xs text-green-400" id="live-indicator-${d.contractAddress || d.tokenAddress}"></span>
            </div>
            <div class="text-xs text-gray-300">${d.name || d.symbol}</div>
            <div class="text-sm mt-1 flex items-center">
              <span>Score: ${(d.overallScore || d.score) ? (d.overallScore || d.score).toFixed(1) : 'N/A'}/10</span>
              <span class="ml-2 px-2 py-0.5 rounded text-xs font-medium" style="background-color: ${hypeData.color}20; color: ${hypeData.color}; border: 1px solid ${hypeData.color}40;">
                ${hypeData.icon} ${hypeData.level}
              </span>
            </div>
            <div class="text-sm" id="mcap-${d.contractAddress || d.tokenAddress}">Market Cap: Loading...</div>
            <div class="text-sm" id="price-${d.contractAddress || d.tokenAddress}">Price: Loading...</div>
            <div class="text-sm" id="volume-${d.contractAddress || d.tokenAddress}">Volume 24h: Loading...</div>
            <div class="text-sm" id="txns-${d.contractAddress || d.tokenAddress}">Txns 24h: Loading...</div>
            <div class="text-sm" id="makers-${d.contractAddress || d.tokenAddress}">Makers 24h: Loading...</div>
            <div class="text-sm" id="age-${d.contractAddress || d.tokenAddress}">Age: Loading...</div>
            <div class="text-xs mt-2 flex gap-2" id="price-changes-${d.contractAddress || d.tokenAddress}">
              <span class="text-gray-400">5M: --</span>
              <span class="text-gray-400">1H: --</span>
              <span class="text-gray-400">6H: --</span>
              <span class="text-gray-400">24H: --</span>
            </div>
          `);
        
        // ✅ Fetch real-time tooltip data
        const tokenAddress = d.contractAddress || d.tokenAddress;
        if (tokenAddress) {
          const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';
          fetch(`${API_BASE}/api/tokens/${tokenAddress}/tooltip-data`)
            .then(res => {
              if (!res.ok) {
                // If 404 or error, show N/A values
                throw new Error('Token not monitored');
              }
              return res.json();
            })
            .then(data => {
              if (data.success && data.data) {
                const rt = data.data;
                
                // Update live indicator
                const liveIndicator = document.getElementById(`live-indicator-${tokenAddress}`);
                if (liveIndicator) {
                  liveIndicator.textContent = rt.isLive ? '📡 Live' : '';
                }
                
                // Update market cap
                const mcapEl = document.getElementById(`mcap-${tokenAddress}`);
                if (mcapEl) {
                  mcapEl.textContent = `Market Cap: ${formatMarketCap(rt.marketCap)}`;
                }
                
                // Update price
                const priceEl = document.getElementById(`price-${tokenAddress}`);
                if (priceEl) {
                  priceEl.textContent = `Price: ${formatPrice(rt.price)}`;
                }
                
                // Update volume
                const volumeEl = document.getElementById(`volume-${tokenAddress}`);
                if (volumeEl) {
                  volumeEl.textContent = `Volume 24h: ${formatMarketCap(rt.volume24h)}`;
                }
                
                // Update txns
                const txnsEl = document.getElementById(`txns-${tokenAddress}`);
                if (txnsEl) {
                  txnsEl.textContent = `Txns 24h: ${rt.txns24h.toLocaleString()}`;
                }
                
                // Update makers
                const makersEl = document.getElementById(`makers-${tokenAddress}`);
                if (makersEl) {
                  makersEl.textContent = `Makers 24h: ${rt.makers24h.toLocaleString()}`;
                }
                
                // Update age
                const ageEl = document.getElementById(`age-${tokenAddress}`);
                if (ageEl) {
                  ageEl.textContent = `Age: ${rt.age}`;
                }
                
                // Update price changes
                const changesEl = document.getElementById(`price-changes-${tokenAddress}`);
                if (changesEl) {
                  const formatChange = (val) => {
                    const color = val >= 0 ? 'text-green-400' : 'text-red-400';
                    const sign = val >= 0 ? '+' : '';
                    return `<span class="${color}">${sign}${val.toFixed(2)}%</span>`;
                  };
                  changesEl.innerHTML = `
                    <span>5M: ${formatChange(rt.priceChange5m)}</span>
                    <span>1H: ${formatChange(rt.priceChange1h)}</span>
                    <span>6H: ${formatChange(rt.priceChange6h)}</span>
                    <span>24H: ${formatChange(rt.priceChange24h)}</span>
                  `;
                }
              }
            })
            .catch(err => {
              console.log('Token not monitored or error:', tokenAddress);
              // Show N/A for tokens not being monitored
              const volumeEl = document.getElementById(`volume-${tokenAddress}`);
              if (volumeEl) volumeEl.textContent = 'Volume 24h: N/A';
              
              const txnsEl = document.getElementById(`txns-${tokenAddress}`);
              if (txnsEl) txnsEl.textContent = 'Txns 24h: N/A';
              
              const makersEl = document.getElementById(`makers-${tokenAddress}`);
              if (makersEl) makersEl.textContent = 'Makers 24h: N/A';
            });
        }
      })
      .on('mousemove', function(event, d) {
        // Update tooltip position as mouse moves over bubble
        const tooltip = d3.select(tooltipRef.current);
        const tooltipWidth = 280; // Matches CSS max-width
        const tooltipHeight = 140; // Increased for better spacing
        
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Position tooltip very close to cursor (prefer top positioning)
        let tooltipX = mouseX + 8; // Small offset to avoid cursor overlap
        let tooltipY = mouseY - tooltipHeight - 8; // Position above cursor with more space
        
        // Smart positioning to avoid going off-screen
        // If tooltip goes off right edge, position it to the left of cursor
        if (tooltipX + tooltipWidth > window.innerWidth) {
          tooltipX = mouseX - tooltipWidth - 8;
        }
        
        // If tooltip goes off top edge, position it below cursor (but still close)
        if (tooltipY < 0) {
          tooltipY = mouseY + 8; // Below cursor, close to it
        }
        
        // If tooltip goes off bottom edge when below cursor, try above again
        if (tooltipY + tooltipHeight > window.innerHeight && tooltipY > mouseY) {
          tooltipY = mouseY - tooltipHeight - 8; // Above cursor
        }
        
        tooltip.style('left', tooltipX + 'px')
          .style('top', tooltipY + 'px');
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

    // Add text labels to new bubbles only
    bubblesEnter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.3em')
      .style('fill', 'white')
      .style('font-size', d => Math.min(radiusScale(d.score || d.overallScore || 5) / 2.5, 18) + 'px')
      .style('font-weight', 'bold')
      .style('pointer-events', 'none')
      .text(d => d.symbol);

    // Update text labels for all bubbles (size may have changed)
    bubblesAll.select('text')
      .style('font-size', d => Math.min(radiusScale(d.score || d.overallScore || 5) / 2.5, 18) + 'px')
      .text(d => d.symbol);

    // Add fire icons for fueled tokens after text is rendered
    bubblesAll.each(function(d) {
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
        
        // Remove old fire icon if exists
        bubble.select('.fire-icon').remove();
        
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
      } else {
        // Remove fire icon if token is no longer fueled
        const bubble = d3.select(this);
        bubble.select('.fire-icon').remove();
      }
    });
    
    // Add subtle pulse animation for high-score tokens (score >= 6)
    bubblesAll.selectAll('circle')
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
      bubblesAll.attr('transform', d => {
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
  }, [tokensWithLiveData, dimensions, onTokenSelect]);

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().duration(750).call(
        zoomRef.current.transform,
        d3.zoomIdentity
      );
    }
  };

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
          
          .zoom-controls {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          
          .zoom-button {
            background: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          }
          
          /* Mobile-specific styling for smaller reset view button */
          @media (max-width: 768px) {
            .zoom-button {
              padding: 4px 8px;
              font-size: 10px;
              border-radius: 4px;
            }
          }
          
          .zoom-button:hover {
            background: rgba(0, 0, 0, 0.9);
            border-color: rgba(255, 255, 255, 0.4);
          }
          
          .zoom-instructions {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            z-index: 10;
          }

        `}
      </style>
      
      {/* Zoom Controls */}
      {tokensWithLiveData.length > 15 && (
        <div className="zoom-controls">
          <div className="relative">
            <button 
              className="zoom-button" 
              onClick={resetZoom}
              onMouseEnter={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'block'; }}
              onMouseLeave={(e) => { const t = e.currentTarget.querySelector('.bubble-tooltip'); if (t) t.style.display = 'none'; }}
            >
              🔍 Reset View
            </button>
            
            {/* Tooltip Modal (matching CategoryFilters design) */}
            <div className="bubble-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50" style={{ display: 'none' }}>
              <div className="text-xs leading-tight">
                <span className="font-semibold text-white">Reset View:</span>
                <span className="text-gray-300 ml-1">Reset zoom to fit all bubbles</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Instructions for many bubbles */}
      {tokensWithLiveData.length > 30 && (
        <div className="zoom-instructions">
          💡 Scroll to zoom • Drag to pan • Click bubbles to explore
        </div>
      )}
      
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

