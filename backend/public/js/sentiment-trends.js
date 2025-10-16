/**
 * Sentiment Trends Visualization with Predictive Indicators
 * 
 * Advanced visualization showing:
 * - Sentiment trends over time
 * - Predictive indicators and forecasts
 * - Confidence intervals
 * - Trend analysis
 */

class SentimentTrendsVisualization {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = {
      width: options.width || 1200,
      height: options.height || 400,
      margin: options.margin || { top: 20, right: 80, bottom: 40, left: 60 },
      ...options
    };
    
    this.data = null;
    this.predictions = null;
    this.svg = null;
    this.tooltip = null;
    this.xScale = null;
    this.yScale = null;
    this.lineGenerator = null;
    this.areaGenerator = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error(`SentimentTrendsVisualization: Container ${this.containerId} not found`);
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
      .attr('class', 'sentiment-tooltip')
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
    // X scale for time
    this.xScale = d3.scaleTime()
      .range([this.options.margin.left, this.options.width - this.options.margin.right]);

    // Y scale for sentiment (-1 to 1)
    this.yScale = d3.scaleLinear()
      .domain([-1, 1])
      .range([this.options.height - this.options.margin.bottom, this.options.margin.top]);

    // Line generator
    this.lineGenerator = d3.line()
      .x(d => this.xScale(d.timestamp))
      .y(d => this.yScale(d.sentiment))
      .curve(d3.curveMonotoneX);

    // Area generator for confidence intervals
    this.areaGenerator = d3.area()
      .x(d => this.xScale(d.timestamp))
      .y0(d => this.yScale(d.sentiment - d.confidence))
      .y1(d => this.yScale(d.sentiment + d.confidence))
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

    // Neutral line
    this.svg.append('line')
      .attr('class', 'neutral-line')
      .attr('x1', this.options.margin.left)
      .attr('x2', this.options.width - this.options.margin.right)
      .attr('y1', this.yScale(0))
      .attr('y2', this.yScale(0))
      .style('stroke', '#64748b')
      .style('stroke-width', 1)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.5);

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
      .text('Sentiment Score');
  }

  createLegend() {
    const legend = this.svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${this.options.width - this.options.margin.right - 200}, ${this.options.margin.top})`);

    // Historical data
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
      .text('Historical Sentiment');

    // Predictions
    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 15)
      .attr('y2', 15)
      .style('stroke', '#f59e0b')
      .style('stroke-width', 2)
      .style('stroke-dasharray', '5,5');

    legend.append('text')
      .attr('x', 25)
      .attr('y', 20)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('Predicted Sentiment');

    // Confidence interval
    legend.append('rect')
      .attr('x', 0)
      .attr('y', 30)
      .attr('width', 20)
      .attr('height', 8)
      .style('fill', '#f59e0b')
      .style('opacity', 0.2);

    legend.append('text')
      .attr('x', 25)
      .attr('y', 38)
      .style('fill', '#94a3b8')
      .style('font-size', '11px')
      .text('Confidence Interval');
  }

  /**
   * Load and render sentiment data
   */
  async loadData(dataSource) {
    try {
      console.log('📈 [Sentiment Trends] Loading data from:', dataSource);
      
      let data;
      if (typeof dataSource === 'string') {
        const response = await fetch(dataSource);
        const result = await response.json();
        data = result.data || result;
      } else {
        data = dataSource;
      }

      this.data = this.processData(data);
      this.render();
      
    } catch (error) {
      console.error('❌ [Sentiment Trends] Error loading data:', error);
      this.renderError('Failed to load sentiment data');
    }
  }

  /**
   * Process raw data into sentiment trend format
   */
  processData(rawData) {
    if (!rawData || !Array.isArray(rawData)) {
      return [];
    }

    // Sort by timestamp
    const sortedData = rawData
      .map(item => ({
        timestamp: new Date(item.timestamp || item.created_at || item.date),
        sentiment: parseFloat(item.sentiment || item.sentimentScore || 0),
        confidence: parseFloat(item.confidence || item.confidenceScore || 0.1),
        volume: parseInt(item.volume || item.mentions || 1),
        source: item.source || 'unknown'
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Calculate moving average for smoother trends
    const windowSize = Math.min(7, Math.floor(sortedData.length / 10));
    const smoothedData = this.calculateMovingAverage(sortedData, windowSize);

    // Generate predictions
    this.predictions = this.generatePredictions(smoothedData);

    return smoothedData;
  }

  /**
   * Calculate moving average for smoothing
   */
  calculateMovingAverage(data, windowSize) {
    if (windowSize <= 1) return data;

    return data.map((point, index) => {
      const start = Math.max(0, index - Math.floor(windowSize / 2));
      const end = Math.min(data.length, start + windowSize);
      const window = data.slice(start, end);
      
      const avgSentiment = window.reduce((sum, p) => sum + p.sentiment, 0) / window.length;
      const avgConfidence = window.reduce((sum, p) => sum + p.confidence, 0) / window.length;
      
      return {
        ...point,
        sentiment: avgSentiment,
        confidence: avgConfidence,
        originalSentiment: point.sentiment
      };
    });
  }

  /**
   * Generate predictions based on trend analysis
   */
  generatePredictions(historicalData) {
    if (historicalData.length < 3) return [];

    const predictions = [];
    const lastPoint = historicalData[historicalData.length - 1];
    const secondLastPoint = historicalData[historicalData.length - 2];
    
    // Calculate trend
    const trend = lastPoint.sentiment - secondLastPoint.sentiment;
    const trendStrength = Math.abs(trend);
    
    // Generate 7-day predictions
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(lastPoint.timestamp);
      futureDate.setDate(futureDate.getDate() + i);
      
      // Simple linear extrapolation with decay
      const decayFactor = Math.exp(-i * 0.1); // Exponential decay
      const predictedSentiment = lastPoint.sentiment + (trend * i * decayFactor);
      
      // Add some noise for realism
      const noise = (Math.random() - 0.5) * 0.1;
      const finalSentiment = Math.max(-1, Math.min(1, predictedSentiment + noise));
      
      // Confidence decreases over time
      const confidence = Math.max(0.1, lastPoint.confidence * decayFactor);
      
      predictions.push({
        timestamp: futureDate,
        sentiment: finalSentiment,
        confidence: confidence,
        isPrediction: true,
        trendStrength: trendStrength
      });
    }

    return predictions;
  }

  /**
   * Render the sentiment trends
   */
  render() {
    if (!this.data || this.data.length === 0) {
      this.renderError('No sentiment data available');
      return;
    }

    console.log('📈 [Sentiment Trends] Rendering trends with', this.data.length, 'data points');

    // Update scales
    this.updateScales();

    // Render confidence intervals for predictions
    if (this.predictions && this.predictions.length > 0) {
      this.renderConfidenceIntervals();
    }

    // Render historical sentiment line
    this.renderHistoricalLine();

    // Render prediction line
    if (this.predictions && this.predictions.length > 0) {
      this.renderPredictionLine();
    }

    // Add trend indicators
    this.addTrendIndicators();

    // Update axes
    this.updateAxes();
  }

  /**
   * Update scales with current data
   */
  updateScales() {
    const allData = [...this.data];
    if (this.predictions) {
      allData.push(...this.predictions);
    }

    const timeExtent = d3.extent(allData, d => d.timestamp);
    this.xScale.domain(timeExtent);
  }

  /**
   * Render confidence intervals
   */
  renderConfidenceIntervals() {
    const confidenceArea = this.svg.selectAll('.confidence-area')
      .data([this.predictions]);

    confidenceArea.exit().remove();

    const newArea = confidenceArea.enter()
      .append('path')
      .attr('class', 'confidence-area');

    confidenceArea.merge(newArea)
      .attr('d', this.areaGenerator)
      .style('fill', '#f59e0b')
      .style('opacity', 0.2);
  }

  /**
   * Render historical sentiment line
   */
  renderHistoricalLine() {
    const line = this.svg.selectAll('.historical-line')
      .data([this.data]);

    line.exit().remove();

    const newLine = line.enter()
      .append('path')
      .attr('class', 'historical-line');

    line.merge(newLine)
      .attr('d', this.lineGenerator)
      .style('fill', 'none')
      .style('stroke', '#3b82f6')
      .style('stroke-width', 2)
      .style('opacity', 0.9);

    // Add data points
    const points = this.svg.selectAll('.data-point')
      .data(this.data);

    points.exit().remove();

    const newPoints = points.enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('r', 3);

    points.merge(newPoints)
      .attr('cx', d => this.xScale(d.timestamp))
      .attr('cy', d => this.yScale(d.sentiment))
      .style('fill', '#3b82f6')
      .style('stroke', '#1e40af')
      .style('stroke-width', 1)
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip());
  }

  /**
   * Render prediction line
   */
  renderPredictionLine() {
    const predictionLine = this.svg.selectAll('.prediction-line')
      .data([this.predictions]);

    predictionLine.exit().remove();

    const newPredictionLine = predictionLine.enter()
      .append('path')
      .attr('class', 'prediction-line');

    predictionLine.merge(newPredictionLine)
      .attr('d', this.lineGenerator)
      .style('fill', 'none')
      .style('stroke', '#f59e0b')
      .style('stroke-width', 2)
      .style('stroke-dasharray', '5,5')
      .style('opacity', 0.8);

    // Add prediction points
    const predictionPoints = this.svg.selectAll('.prediction-point')
      .data(this.predictions);

    predictionPoints.exit().remove();

    const newPredictionPoints = predictionPoints.enter()
      .append('circle')
      .attr('class', 'prediction-point')
      .attr('r', 2);

    predictionPoints.merge(newPredictionPoints)
      .attr('cx', d => this.xScale(d.timestamp))
      .attr('cy', d => this.yScale(d.sentiment))
      .style('fill', '#f59e0b')
      .style('stroke', '#d97706')
      .style('stroke-width', 1)
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip());
  }

  /**
   * Add trend indicators
   */
  addTrendIndicators() {
    if (!this.predictions || this.predictions.length === 0) return;

    const lastPrediction = this.predictions[this.predictions.length - 1];
    const trendDirection = lastPrediction.sentiment > 0 ? 'bullish' : 'bearish';
    const trendStrength = lastPrediction.trendStrength;

    // Add trend arrow
    const arrowX = this.xScale(lastPrediction.timestamp) + 20;
    const arrowY = this.yScale(lastPrediction.sentiment);
    const arrowRotation = trendDirection === 'bullish' ? 0 : 180;

    this.svg.selectAll('.trend-arrow').remove();

    this.svg.append('path')
      .attr('class', 'trend-arrow')
      .attr('d', 'M0,0 L10,5 L10,-5 Z')
      .attr('transform', `translate(${arrowX}, ${arrowY}) rotate(${arrowRotation})`)
      .style('fill', trendDirection === 'bullish' ? '#10b981' : '#ef4444')
      .style('opacity', Math.min(1, trendStrength * 2));

    // Add trend text
    this.svg.append('text')
      .attr('class', 'trend-text')
      .attr('x', arrowX + 15)
      .attr('y', arrowY + 5)
      .style('fill', trendDirection === 'bullish' ? '#10b981' : '#ef4444')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .text(`${trendDirection.toUpperCase()} TREND`);
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
  showTooltip(event, d) {
    const isPrediction = d.isPrediction;
    const tooltipContent = `
      <div style="font-weight: bold; margin-bottom: 4px;">
        ${isPrediction ? '🔮 Prediction' : '📊 Historical'}
      </div>
      <div>Date: ${d3.timeFormat('%Y-%m-%d %H:%M')(d.timestamp)}</div>
      <div>Sentiment: ${(d.sentiment * 100).toFixed(1)}%</div>
      <div>Confidence: ${(d.confidence * 100).toFixed(1)}%</div>
      ${d.volume ? `<div>Volume: ${d.volume}</div>` : ''}
      ${d.trendStrength ? `<div>Trend Strength: ${(d.trendStrength * 100).toFixed(1)}%</div>` : ''}
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
    this.svg.selectAll('.historical-line, .prediction-line, .confidence-area, .data-point, .prediction-point').remove();
    
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
  module.exports = SentimentTrendsVisualization;
} else if (typeof window !== 'undefined') {
  window.SentimentTrendsVisualization = SentimentTrendsVisualization;
}
