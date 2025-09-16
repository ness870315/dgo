import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import chartService from '../services/chartService';

const TradingViewChart = ({ token, timeframe = '1D', onClose }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper: normalize candles data
  const normalizeCandles = (rows) => {
    if (!Array.isArray(rows)) return [];
    const toSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : t); // ms -> s
    const out = rows.map((d) => ({
      time: toSec(d.time ?? d.t),
      open: +d.open ?? +d.o ?? +d.value,
      high: +d.high ?? +d.h ?? +d.value,
      low: +d.low ?? +d.l ?? +d.value,
      close: +d.close ?? +d.c ?? +d.value,
      volume: +d.volume ?? 0,
    })).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close));
    out.sort((a, b) => a.time - b.time); // Always ascending
    return out;
  };

  // Load chart data
  const loadChartData = async () => {
    if (!token?.contractAddress) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading chart data for:', token.contractAddress, 'timeframe:', timeframe);
      const response = await chartService.getPriceChart(token.contractAddress, timeframe);
      
      if (response.success && response.data) {
        console.log('Chart service response:', response);
        const formattedData = response.data.map(item => ({
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume || 0
        }));
        
        console.log('Formatted chart data:', formattedData);
        setChartData(formattedData);
      } else {
        throw new Error('No data received from chart service');
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setError('Failed to load chart data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load data when token or timeframe changes
  useEffect(() => {
    if (token?.contractAddress) {
      loadChartData();
    }
  }, [token?.contractAddress, timeframe]);

  // Chart creation and data application - following the clean structure
  useEffect(() => {
    console.log('Chart useEffect triggered - data length:', chartData.length);
    
    if (!chartContainerRef.current) {
      console.log('Container not ready yet');
      return;
    }

    if (!chartRef.current) {
      console.log('Creating new chart...');
      
      // Create chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.offsetWidth || 800,
        height: 400,
        layout: {
          backgroundColor: "#131722",
          textColor: "#d1d4dc",
        },
        grid: {
          vertLines: { color: "#363c4e" },
          horzLines: { color: "#363c4e" },
        },
        timeScale: {
          timeVisible: true,
          borderVisible: true,
        },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: "#089981",
        downColor: "#f23645",
        borderVisible: false,
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
      });

      chartRef.current = { chart, candlestickSeries };
      console.log('Chart created successfully');
    }

    // Apply data if available
    if (chartData.length > 0) {
      console.log('Applying data to chart...');
      const candles = normalizeCandles(chartData);
      
      if (candles.length > 0) {
        // Check for flat data
        const flatCandles = candles.filter(c => c.open === c.high && c.high === c.low && c.low === c.close);
        console.log(`Data analysis: ${candles.length} total, ${flatCandles.length} flat (${((flatCandles.length/candles.length)*100).toFixed(1)}%)`);
        
        if (flatCandles.length > candles.length * 0.8) {
          console.warn('⚠️ Most candles are flat (no price movement) - chart may appear empty');
        }
        
        chartRef.current.candlestickSeries.setData(candles);
        chartRef.current.chart.timeScale().fitContent();
        console.log('Data applied successfully');
      }
    }

    return () => {
      if (chartRef.current) {
        console.log('Cleaning up chart');
        chartRef.current.chart.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, timeframe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-800 rounded-lg">
        <div className="text-white">Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-800 rounded-lg">
        <div className="text-red-400 mb-4">Error: {error}</div>
        <button 
          onClick={loadChartData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="w-full bg-gray-800 rounded-lg"
        style={{ width: "100%", height: "400px", position: "relative" }}
      />
    </div>
  );
};

export default TradingViewChart;