/**
 * Timeline Heatmaps Visualization with D3.js
 * 
 * Advanced visualization showing:
 * - KOL activity patterns over time
 * - Price movements correlation
 * - Sentiment intensity heatmaps
 * - Performance indicators
 */

class TimelineHeatmapVisualization {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = {
      width: options.width || 1200,
      height: options.height || 600,
      margin: options.margin || { top: 20, right: 20, bottom: 40, left: 80 },
      cellSize: options.cellSize || 12,
      ...options
    };
    
    this.data = null;
    this.svg = null;
    this.tooltip = null;
    this.colorScale = null;
    this.xScale = null;
    this.yScale = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error(`TimelineHeatmapVisualization: Container ${this.containerId} not found`);
      return;
    }

    // Create SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', this.options.width)
      .attr('height', this.options.height)
      .style('background', '#0f172a');

    // Create tooltip
    this.tooltip = d3.select('body')
      .append('div')
      .attr('class', 'heatmap-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    // Create scales
    this.setupScales();
    
    // Create axes
    this.createAxes();
    
    // Create legend
    this.createLegend();
  }

  setupScales() {
    // Color scale for intensity
    this.colorScale = d3.scaleSequential()
      .interpolator(d3.interpolateViridis)
      .domain([0, 1]);

    // X scale for time
    this.xScale = d3.scaleTime()
      .range([this.options.margin.left, this.options.width - this.options.margin.right]);

    // Y scale for categories/KOLs
    this.yScale = d3.scaleBand()
      .range([this.options.margin.top, this.options.height - this.options.margin.bottom])
      .padding(0.1);
  }

  createAxes() {
    // X axis
    this.svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${this.options.height - this.options.margin.bottom})`)
      .style('color', '#64748b')
      .style('font-size', '11px');

    // Y axis
    this.svg.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${this.options.margin.left}, 0)`)
      .style('color', '#64748b')
      .style('font-size', '11px');

    // X axis label
    this.svg.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', this.options.width / 2)
      .attr('y', this.options.height - 5)
      .attr('text-anchor', 'middle')
      .style('fill', '#94a3b8')
      .style('font-size', '12px')
      .text('Time');

    // Y axis label
    this.svg.append('text')
      .attr('class', 'y-axis-label')
      .attr('x', -this.options.height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .style('fill', '#94a3b8')
      .style('font-size', '12px')
      .text('KOLs / Categories');
  }

  createLegend() {
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = this.options.width - this.options.margin.right - legendWidth;
    const legendY = this.options.margin.top;

    // Legend container
    const legend = this.svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${legendX}, ${legendY})`);

    // Legend gradient
    const gradient = legend.append('defs')
      .append('linearGradient')
      .attr('id', 'heatmap-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');

    // Add gradient stops
    const stops = [0, 0.25, 0.5, 0.75, 1];
    stops.forEach(stop => {
      gradient.append('stop')
        .attr('offset', `${stop * 100}%`)
        .attr('stop-color', this.colorScale(stop));
    });

    // Legend rectangle
    legend.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#heatmap-gradient)')
      .style('stroke', '#374151')
      .style('stroke-width', 1);

    // Legend labels
    legend.append('text')
      .attr('x', 0)
      .attr('y', legendHeight + 15)
      .style('fill', '#94a3b8')
      .style('font-size', '10px')
      .text('Low Activity');

    legend.append('text')
      .attr('x', legendWidth)
      .attr('y', legendHeight + 15)
      .attr('text-anchor', 'end')
      .style('fill', '#94a3b8')
      .style('font-size', '10px')
      .text('High Activity');
  }

  /**
   * Load and render heatmap data
   */
  async loadData(dataSource) {
    try {
      console.log('🔥 [Timeline Heatmap] Loading data from:', dataSource);
      
      let data;
      if (typeof dataSource === 'string') {
        // API endpoint
        const response = await fetch(dataSource);
        const result = await response.json();
        data = result.data || result;
      } else {
        // Direct data
        data = dataSource;
      }

      this.data = this.processData(data);
      this.render();
      
    } catch (error) {
      console.error('❌ [Timeline Heatmap] Error loading data:', error);
      this.renderError('Failed to load heatmap data');
    }
  }

  /**
   * Process raw data into heatmap format
   */
  processData(rawData) {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }

    // Group data by KOL and time period
    const heatmapData = new Map();
    const timeExtent = [new Date(), new Date()];
    const kolSet = new Set();

    rawData.forEach(item => {
      const kolHandle = item.kolHandle || item.handle || 'Unknown';
      const timestamp = new Date(item.timestamp || item.created_at || item.date);
      const timeKey = this.getTimeKey(timestamp);
      
      kolSet.add(kolHandle);
      
      // Update time extent
      if (timestamp < timeExtent[0]) timeExtent[0] = timestamp;
      if (timestamp > timeExtent[1]) timeExtent[1] = timestamp;

      // Initialize if not exists
      if (!heatmapData.has(kolHandle)) {
        heatmapData.set(kolHandle, new Map());
      }

      // Aggregate data for this time period
      const kolData = heatmapData.get(kolHandle);
      if (!kolData.has(timeKey)) {
        kolData.set(timeKey, {
          kolHandle,
          timeKey,
          timestamp,
          activity: 0,
          sentiment: 0,
          performance: 0,
          mentions: 0,
          engagement: 0
        });
      }

      const cellData = kolData.get(timeKey);
      
      // Aggregate metrics
      cellData.activity += item.activity || 1;
      cellData.sentiment += item.sentiment || 0;
      cellData.performance += item.performance || 0;
      cellData.mentions += item.mentions || 1;
      cellData.engagement += item.engagement || 0;
    });

    // Convert to array and normalize
    const processedData = [];
    const kols = Array.from(kolSet).sort();

    kols.forEach(kolHandle => {
      const kolData = heatmapData.get(kolHandle);
      kolData.forEach(cellData => {
        // Normalize values
        cellData.normalizedActivity = Math.min(1, cellData.activity / 10);
        cellData.normalizedSentiment = Math.max(-1, Math.min(1, cellData.sentiment / cellData.mentions));
        cellData.normalizedPerformance = Math.max(-1, Math.min(1, cellData.performance / cellData.mentions));
        cellData.normalizedEngagement = Math.min(1, cellData.engagement / 1000);
        
        processedData.push(cellData);
      });
    });

    // Update scales
    this.xScale.domain(timeExtent);
    this.yScale.domain(kols);

    return processedData;
  }

  /**
   * Get time key for grouping (daily, hourly, etc.)
   */
  getTimeKey(timestamp) {
    const date = new Date(timestamp);
    // Group by day for now
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  /**
   * Render the heatmap
   */
  render() {
    if (!this.data || this.data.length === 0) {
      this.renderError('No data available');
      return;
    }

    console.log('🔥 [Timeline Heatmap] Rendering heatmap with', this.data.length, 'data points');

    // Update axes
    this.updateAxes();

    // Create heatmap cells
    const cells = this.svg.selectAll('.heatmap-cell')
      .data(this.data, d => `${d.kolHandle}-${d.timeKey}`);

    // Remove old cells
    cells.exit().remove();

    // Add new cells
    const newCells = cells.enter()
      .append('rect')
      .attr('class', 'heatmap-cell')
      .attr('width', this.options.cellSize)
      .attr('height', this.options.cellSize)
      .style('stroke', '#374151')
      .style('stroke-width', 0.5);

    // Update all cells
    cells.merge(newCells)
      .attr('x', d => this.xScale(d.timestamp))
      .attr('y', d => this.yScale(d.kolHandle))
      .style('fill', d => this.colorScale(d.normalizedActivity))
      .style('opacity', 0.8)
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip())
      .on('click', (event, d) => this.onCellClick(event, d));

    // Add performance indicators
    this.addPerformanceIndicators();
  }

  /**
   * Update axes with current data
   */
  updateAxes() {
    // Update X axis
    this.svg.select('.x-axis')
      .call(d3.axisBottom(this.xScale)
        .tickFormat(d3.timeFormat('%m/%d'))
        .ticks(8));

    // Update Y axis
    this.svg.select('.y-axis')
      .call(d3.axisLeft(this.yScale)
        .tickFormat(d => `@${d}`));
  }

  /**
   * Add performance indicators (small dots)
   */
  addPerformanceIndicators() {
    const indicators = this.svg.selectAll('.performance-indicator')
      .data(this.data.filter(d => Math.abs(d.normalizedPerformance) > 0.3), d => `${d.kolHandle}-${d.timeKey}`);

    indicators.exit().remove();

    const newIndicators = indicators.enter()
      .append('circle')
      .attr('class', 'performance-indicator')
      .attr('r', 2);

    indicators.merge(newIndicators)
      .attr('cx', d => this.xScale(d.timestamp) + this.options.cellSize / 2)
      .attr('cy', d => this.yScale(d.kolHandle) + this.options.cellSize / 2)
      .style('fill', d => d.normalizedPerformance > 0 ? '#10b981' : '#ef4444')
      .style('opacity', 0.9)
      .style('pointer-events', 'none');
  }

  /**
   * Show tooltip on hover
   */
  showTooltip(event, d) {
    const tooltipContent = `
      <div style="font-weight: bold; margin-bottom: 4px;">@${d.kolHandle}</div>
      <div>Date: ${d3.timeFormat('%Y-%m-%d')(d.timestamp)}</div>
      <div>Activity: ${(d.normalizedActivity * 100).toFixed(1)}%</div>
      <div>Sentiment: ${(d.normalizedSentiment * 100).toFixed(1)}%</div>
      <div>Performance: ${(d.normalizedPerformance * 100).toFixed(1)}%</div>
      <div>Mentions: ${d.mentions}</div>
      <div>Engagement: ${d.engagement}</div>
    `;

    this.tooltip
      .html(tooltipContent)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
      .transition()
      .duration(200)
      .style('opacity', 1);
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    this.tooltip
      .transition()
      .duration(200)
      .style('opacity', 0);
  }

  /**
   * Handle cell click
   */
  onCellClick(event, d) {
    console.log('🔥 [Timeline Heatmap] Cell clicked:', d);
    
    // Dispatch custom event
    const customEvent = new CustomEvent('heatmapCellClick', {
      detail: d
    });
    this.container.dispatchEvent(customEvent);
  }

  /**
   * Render error state
   */
  renderError(message) {
    this.svg.selectAll('.heatmap-cell').remove();
    this.svg.selectAll('.performance-indicator').remove();
    
    this.svg.append('text')
      .attr('class', 'error-message')
      .attr('x', this.options.width / 2)
      .attr('y', this.options.height / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#ef4444')
      .style('font-size', '14px')
      .text(message);
  }

  /**
   * Update visualization with new data
   */
  update(newData) {
    this.loadData(newData);
  }

  /**
   * Resize visualization
   */
  resize(width, height) {
    this.options.width = width;
    this.options.height = height;
    
    this.svg
      .attr('width', width)
      .attr('height', height);
    
    this.setupScales();
    this.render();
  }

  /**
   * Destroy visualization
   */
  destroy() {
    if (this.tooltip) {
      this.tooltip.remove();
    }
    if (this.svg) {
      this.svg.remove();
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimelineHeatmapVisualization;
} else if (typeof window !== 'undefined') {
  window.TimelineHeatmapVisualization = TimelineHeatmapVisualization;
}
