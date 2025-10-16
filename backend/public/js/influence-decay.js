/**
 * Influence Decay Time Series Analysis Visualization
 * 
 * Advanced visualization showing:
 * - KOL influence decay over time
 * - Performance correlation analysis
 * - Influence lifecycle patterns
 * - Predictive decay modeling
 */

class InfluenceDecayVisualization {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = {
      width: options.width || 1200,
      height: options.height || 500,
      margin: options.margin || { top: 20, right: 80, bottom: 40, left: 80 },
      ...options
    };
    
    this.data = null;
    this.decayModels = null;
    this.svg = null;
    this.tooltip = null;
    this.xScale = null;
    this.yScale = null;
    this.colorScale = null;
    this.lineGenerator = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error(`InfluenceDecayVisualization: Container ${this.containerId} not found`);
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
      .attr('class', 'influence-decay-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '1000');

    // Create scales
    this.setupScales();
    
    // Create axes
    this.createAxes();
    
    // Create legend
    this.createLegend();
  }

  setupScales() {
    // X scale for time
    this.xScale = d3.scaleTime()
      .range([this.options.margin.left, this.options.width - this.options.margin.right]);

    // Y scale for influence (0 to 1)
    this.yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([this.options.height - this.options.margin.bottom, this.options.margin.top]);

    // Color scale for different KOLs
    this.colorScale = d3.scaleOrdinal()
      .range(d3.schemeCategory10);

    // Line generator
    this.lineGenerator = d3.line()
      .x(d => this.xScale(d.timestamp))
      .y(d => this.yScale(d.influence))
      .curve(d3.curveMonotoneX);
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
      .text('Influence Score');
  }

  createLegend() {
    const legend = this.svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${this.options.width - this.options.margin.right - 250}, ${this.options.margin.top})`);

    // Influence line
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .style('stroke', '#3b82f6')
      .style('stroke-width', 2);

    legend.append('text')
      .attr('x', 25)
      .attr('y', 5)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('Actual Influence');

    // Decay model
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 15)
      .attr('y2', 15)
      .style('stroke', '#ef4444')
      .style('stroke-width', 2)
      .style('stroke-dasharray', '5,5');

    legend.append('text')
      .attr('x', 25)
      .attr('y', 20)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('Decay Model');

    // Performance correlation
    legend.append('circle')
      .attr('cx', 10)
      .attr('cy', 30)
      .attr('r', 3)
      .style('fill', '#10b981');

    legend.append('text')
      .attr('x', 25)
      .attr('y', 35)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('High Performance');

    legend.append('circle')
      .attr('cx', 10)
      .attr('cy', 45)
      .attr('r', 3)
      .style('fill', '#ef4444');

    legend.append('text')
      .attr('x', 25)
      .attr('y', 50)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('Low Performance');
  }

  /**
   * Load and render influence decay data
   */
  async loadData(dataSource) {
    try {
      console.log('📉 [Influence Decay] Loading data from:', dataSource);
      
      let data;
      if (typeof dataSource === 'string') {
        const response = await fetch(dataSource);
        const result = await response.json();
        data = result.data || result;
      } else {
        data = dataSource;
      }

      this.data = this.processData(data);
      this.decayModels = this.calculateDecayModels(this.data);
      this.render();
      
    } catch (error) {
      console.error('❌ [Influence Decay] Error loading data:', error);
      this.renderError('Failed to load influence decay data');
    }
  }

  /**
   * Process raw data into influence decay format
   */
  processData(rawData) {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }

    // Group data by KOL
    const kolGroups = new Map();
    
    rawData.forEach(item => {
      const kolHandle = item.kolHandle || item.handle || 'Unknown';
      const timestamp = new Date(item.timestamp || item.created_at || item.date);
      
      if (!kolGroups.has(kolHandle)) {
        kolGroups.set(kolHandle, []);
      }
      
      kolGroups.get(kolHandle).push({
        timestamp,
        influence: parseFloat(item.influence || item.influenceScore || 0),
        performance: parseFloat(item.performance || item.performanceScore || 0),
        engagement: parseFloat(item.engagement || item.engagementScore || 0),
        followers: parseInt(item.followers || 0),
        mentions: parseInt(item.mentions || 1),
        sentiment: parseFloat(item.sentiment || 0)
      });
    });

    // Process each KOL's data
    const processedData = [];
    
    kolGroups.forEach((kolData, kolHandle) => {
      // Sort by timestamp
      kolData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Calculate normalized influence over time
      const normalizedData = this.normalizeInfluenceData(kolData);
      
      processedData.push({
        kolHandle,
        data: normalizedData,
        peakInfluence: Math.max(...normalizedData.map(d => d.influence)),
        currentInfluence: normalizedData[normalizedData.length - 1]?.influence || 0,
        decayRate: this.calculateDecayRate(normalizedData),
        performanceTrend: this.calculatePerformanceTrend(normalizedData)
      });
    });

    return processedData;
  }

  /**
   * Normalize influence data for comparison
   */
  normalizeInfluenceData(kolData) {
    if (kolData.length === 0) return [];
    
    const maxInfluence = Math.max(...kolData.map(d => d.influence));
    const minInfluence = Math.min(...kolData.map(d => d.influence));
    const influenceRange = maxInfluence - minInfluence;
    
    return kolData.map(d => ({
      ...d,
      influence: influenceRange > 0 ? (d.influence - minInfluence) / influenceRange : 0.5,
      normalizedPerformance: Math.max(0, Math.min(1, (d.performance + 1) / 2)) // Convert -1,1 to 0,1
    }));
  }

  /**
   * Calculate decay rate for each KOL
   */
  calculateDecayRate(kolData) {
    if (kolData.length < 2) return 0;
    
    const firstHalf = kolData.slice(0, Math.floor(kolData.length / 2));
    const secondHalf = kolData.slice(Math.floor(kolData.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, d) => sum + d.influence, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, d) => sum + d.influence, 0) / secondHalf.length;
    
    return (firstAvg - secondAvg) / firstAvg; // Decay rate as percentage
  }

  /**
   * Calculate performance trend
   */
  calculatePerformanceTrend(kolData) {
    if (kolData.length < 2) return 'stable';
    
    const recent = kolData.slice(-3);
    const older = kolData.slice(0, 3);
    
    const recentAvg = recent.reduce((sum, d) => sum + d.normalizedPerformance, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.normalizedPerformance, 0) / older.length;
    
    const trend = recentAvg - olderAvg;
    
    if (trend > 0.1) return 'improving';
    if (trend < -0.1) return 'declining';
    return 'stable';
  }

  /**
   * Calculate decay models for prediction
   */
  calculateDecayModels(processedData) {
    return processedData.map(kolData => {
      const data = kolData.data;
      if (data.length < 3) return null;
      
      // Fit exponential decay model: influence(t) = a * e^(-b * t)
      const timeValues = data.map((d, i) => i);
      const influenceValues = data.map(d => d.influence);
      
      // Simple linear regression on log-transformed data
      const logInfluence = influenceValues.map(val => Math.log(Math.max(val, 0.001)));
      
      const n = timeValues.length;
      const sumX = timeValues.reduce((sum, x) => sum + x, 0);
      const sumY = logInfluence.reduce((sum, y) => sum + y, 0);
      const sumXY = timeValues.reduce((sum, x, i) => sum + x * logInfluence[i], 0);
      const sumXX = timeValues.reduce((sum, x) => sum + x * x, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      const decayRate = -slope;
      const initialInfluence = Math.exp(intercept);
      
      return {
        kolHandle: kolData.kolHandle,
        decayRate: Math.max(0, decayRate),
        initialInfluence: Math.min(1, initialInfluence),
        model: (t) => initialInfluence * Math.exp(-decayRate * t),
        rSquared: this.calculateRSquared(data, (t) => initialInfluence * Math.exp(-decayRate * t))
      };
    }).filter(model => model !== null);
  }

  /**
   * Calculate R-squared for model fit
   */
  calculateRSquared(data, model) {
    const actualValues = data.map(d => d.influence);
    const predictedValues = data.map((d, i) => model(i));
    
    const actualMean = actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length;
    
    const ssRes = actualValues.reduce((sum, val, i) => sum + Math.pow(val - predictedValues[i], 2), 0);
    const ssTot = actualValues.reduce((sum, val) => sum + Math.pow(val - actualMean, 2), 0);
    
    return 1 - (ssRes / ssTot);
  }

  /**
   * Render the influence decay visualization
   */
  render() {
    if (!this.data || this.data.length === 0) {
      this.renderError('No influence decay data available');
      return;
    }

    console.log('📉 [Influence Decay] Rendering decay analysis with', this.data.length, 'KOLs');

    // Update scales
    this.updateScales();

    // Render decay models
    this.renderDecayModels();

    // Render actual influence lines
    this.renderInfluenceLines();

    // Add performance indicators
    this.addPerformanceIndicators();

    // Update axes
    this.updateAxes();
  }

  /**
   * Update scales with current data
   */
  updateScales() {
    const allData = this.data.flatMap(kol => kol.data);
    const timeExtent = d3.extent(allData, d => d.timestamp);
    this.xScale.domain(timeExtent);
    
    // Update color scale domain
    this.colorScale.domain(this.data.map(kol => kol.kolHandle));
  }

  /**
   * Render decay models
   */
  renderDecayModels() {
    this.decayModels.forEach(model => {
      const kolData = this.data.find(kol => kol.kolHandle === model.kolHandle);
      if (!kolData) return;
      
      // Generate model predictions
      const timeRange = d3.range(0, kolData.data.length, 0.1);
      const modelData = timeRange.map(t => ({
        timestamp: kolData.data[Math.floor(t)]?.timestamp || kolData.data[kolData.data.length - 1].timestamp,
        influence: model.model(t),
        isModel: true
      }));
      
      const line = this.svg.selectAll(`.decay-model-${model.kolHandle}`)
        .data([modelData]);
      
      line.exit().remove();
      
      const newLine = line.enter()
        .append('path')
        .attr('class', `decay-model-${model.kolHandle}`)
        .attr('data-kol', model.kolHandle);
      
      line.merge(newLine)
        .attr('d', this.lineGenerator)
        .style('fill', 'none')
        .style('stroke', '#ef4444')
        .style('stroke-width', 1)
        .style('stroke-dasharray', '5,5')
        .style('opacity', 0.6);
    });
  }

  /**
   * Render actual influence lines
   */
  renderInfluenceLines() {
    this.data.forEach(kolData => {
      const line = this.svg.selectAll(`.influence-line-${kolData.kolHandle}`)
        .data([kolData.data]);
      
      line.exit().remove();
      
      const newLine = line.enter()
        .append('path')
        .attr('class', `influence-line-${kolData.kolHandle}`)
        .attr('data-kol', kolData.kolHandle);
      
      line.merge(newLine)
        .attr('d', this.lineGenerator)
        .style('fill', 'none')
        .style('stroke', this.colorScale(kolData.kolHandle))
        .style('stroke-width', 2)
        .style('opacity', 0.8);

      // Add data points
      const points = this.svg.selectAll(`.influence-point-${kolData.kolHandle}`)
        .data(kolData.data);
      
      points.exit().remove();
      
      const newPoints = points.enter()
        .append('circle')
        .attr('class', `influence-point-${kolData.kolHandle}`)
        .attr('r', 3);
      
      points.merge(newPoints)
        .attr('cx', d => this.xScale(d.timestamp))
        .attr('cy', d => this.yScale(d.influence))
        .style('fill', this.colorScale(kolData.kolHandle))
        .style('stroke', '#1e293b')
        .style('stroke-width', 1)
        .on('mouseover', (event, d) => this.showTooltip(event, d, kolData))
        .on('mouseout', () => this.hideTooltip());
    });
  }

  /**
   * Add performance indicators
   */
  addPerformanceIndicators() {
    this.data.forEach(kolData => {
      const highPerformancePoints = kolData.data.filter(d => d.normalizedPerformance > 0.7);
      const lowPerformancePoints = kolData.data.filter(d => d.normalizedPerformance < 0.3);
      
      // High performance indicators
      const highPerf = this.svg.selectAll(`.high-perf-${kolData.kolHandle}`)
        .data(highPerformancePoints);
      
      highPerf.exit().remove();
      
      const newHighPerf = highPerf.enter()
        .append('circle')
        .attr('class', `high-perf-${kolData.kolHandle}`)
        .attr('r', 4);
      
      highPerf.merge(newHighPerf)
        .attr('cx', d => this.xScale(d.timestamp))
        .attr('cy', d => this.yScale(d.influence))
        .style('fill', '#10b981')
        .style('stroke', '#059669')
        .style('stroke-width', 2)
        .style('opacity', 0.8);
      
      // Low performance indicators
      const lowPerf = this.svg.selectAll(`.low-perf-${kolData.kolHandle}`)
        .data(lowPerformancePoints);
      
      lowPerf.exit().remove();
      
      const newLowPerf = lowPerf.enter()
        .append('circle')
        .attr('class', `low-perf-${kolData.kolHandle}`)
        .attr('r', 4);
      
      lowPerf.merge(newLowPerf)
        .attr('cx', d => this.xScale(d.timestamp))
        .attr('cy', d => this.yScale(d.influence))
        .style('fill', '#ef4444')
        .style('stroke', '#dc2626')
        .style('stroke-width', 2)
        .style('opacity', 0.8);
    });
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
        .tickFormat(d3.format('.2f'))
        .ticks(5));
  }

  /**
   * Show tooltip on hover
   */
  showTooltip(event, d, kolData) {
    const model = this.decayModels.find(m => m.kolHandle === kolData.kolHandle);
    const tooltipContent = `
      <div style="font-weight: bold; margin-bottom: 4px;">@${kolData.kolHandle}</div>
      <div>Date: ${d3.timeFormat('%Y-%m-%d')(d.timestamp)}</div>
      <div>Influence: ${(d.influence * 100).toFixed(1)}%</div>
      <div>Performance: ${(d.normalizedPerformance * 100).toFixed(1)}%</div>
      <div>Engagement: ${d.engagement}</div>
      <div>Decay Rate: ${(kolData.decayRate * 100).toFixed(1)}%</div>
      ${model ? `<div>Model Fit: ${(model.rSquared * 100).toFixed(1)}%</div>` : ''}
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
   * Render error state
   */
  renderError(message) {
    this.svg.selectAll('.influence-line, .decay-model, .influence-point, .high-perf, .low-perf').remove();
    
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
  module.exports = InfluenceDecayVisualization;
} else if (typeof window !== 'undefined') {
  window.InfluenceDecayVisualization = InfluenceDecayVisualization;
}
