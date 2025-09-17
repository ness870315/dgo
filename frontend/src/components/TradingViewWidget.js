import React, { useEffect, useRef, useState, useMemo } from 'react';
import chartService from '../services/chartService';

const TradingViewWidget = ({ token, onClose }) => {
  const container = useRef();
  const [timeframe, setTimeframe] = useState('1D');
  const [displayMode, setDisplayMode] = useState('price');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  // Load our Solana token data
  useEffect(() => {
    if (!token?.contract) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const contract = token.contract || token.contractAddress || token.mint || token.address;
        const response = await chartService.getPriceChartRD(contract, timeframe);
        setChartData(response);
      } catch (error) {
        console.error('Failed to load chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token, timeframe]);

  // Convert our data to TradingView format
  const tradingViewData = useMemo(() => {
    if (!chartData?.data?.length) return null;

    const candles = chartData.data.map(d => ({
      time: Math.floor(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume) || 0
    }));

    // Apply market cap transform if needed
    let finalCandles = candles;
    if (displayMode === 'mcap' && token?.circulatingSupply) {
      const supply = token.circulatingSupply;
      finalCandles = candles.map(c => ({
        ...c,
        open: c.open * supply,
        high: c.high * supply,
        low: c.low * supply,
        close: c.close * supply
      }));
    }

    return finalCandles;
  }, [chartData, displayMode, token]);

  // Initialize TradingView widget
  useEffect(() => {
    if (!container.current || !tradingViewData?.length) return;

    // Clear previous widget
    container.current.innerHTML = '';

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    // Convert timeframe to TradingView format
    const tvTimeframe = {
      '1MIN': '1',
      '5MIN': '5', 
      '15MIN': '15',
      '1H': '60',
      '4H': '240',
      '1D': 'D',
      '1W': 'W',
      '1M': 'M'
    }[timeframe] || 'D';

    script.innerHTML = `
      {
        "allow_symbol_change": false,
        "calendar": false,
        "details": true,
        "hide_side_toolbar": false,
        "hide_top_toolbar": false,
        "hide_legend": false,
        "hide_volume": false,
        "hotlist": false,
        "interval": "${tvTimeframe}",
        "locale": "en",
        "save_image": true,
        "style": "1",
        "symbol": "CUSTOM:${token?.symbol || 'TOKEN'}",
        "theme": "dark",
        "timezone": "Etc/UTC",
        "backgroundColor": "#0F0F0F",
        "gridColor": "rgba(242, 242, 242, 0.06)",
        "watchlist": [],
        "withdateranges": true,
        "compareSymbols": [],
        "studies": [
          "RSI@tv-basicstudies",
          "MACD@tv-basicstudies",
          "BollingerBands@tv-basicstudies"
        ],
        "autosize": true,
        "datafeed": {
          "onReady": function(callback) {
            console.log('TradingView datafeed ready');
            callback({
              exchanges: [{
                value: 'CUSTOM',
                name: 'Custom Solana Tokens',
                desc: 'Solana token data'
              }],
              symbols_types: [{
                name: 'Crypto',
                value: 'crypto'
              }],
              supported_resolutions": ["1", "5", "15", "60", "240", "D", "W", "M"],
              supports_marks: false,
              supports_timescale_marks: false,
              supports_time: true
            });
          },
          "searchSymbols": function(userInput, exchange, symbolType, onResultReadyCallback) {
            onResultReadyCallback([{
              symbol: '${token?.symbol || 'TOKEN'}',
              full_name: 'CUSTOM:${token?.symbol || 'TOKEN'}',
              description: '${token?.name || token?.symbol || 'Token'}',
              exchange: 'CUSTOM',
              ticker: '${token?.symbol || 'TOKEN'}',
              type: 'crypto'
            }]);
          },
          "resolveSymbol": function(symbolName, onSymbolResolvedCallback, onResolveErrorCallback) {
            onSymbolResolvedCallback({
              name: '${token?.symbol || 'TOKEN'}',
              ticker: '${token?.symbol || 'TOKEN'}',
              description: '${token?.name || token?.symbol || 'Token'}',
              type: 'crypto',
              session: '24x7',
              timezone: 'Etc/UTC',
              exchange: 'CUSTOM',
              minmov: 1,
              pricescale: 100000000,
              has_intraday: true,
              has_weekly_and_monthly: true,
              supported_resolutions: ["1", "5", "15", "60", "240", "D", "W", "M"],
              volume_precision: 0,
              data_status: 'streaming'
            });
          },
          "getBars": function(symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) {
            console.log('Getting bars for', symbolInfo.name, 'from', from, 'to', to, 'resolution', resolution);
            
            // Convert our data to TradingView format
            const bars = ${JSON.stringify(tradingViewData)}.map(candle => ({
              time: candle.time * 1000, // Convert to milliseconds
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume
            })).filter(bar => bar.time >= from * 1000 && bar.time <= to * 1000);
            
            console.log('Returning', bars.length, 'bars');
            onHistoryCallback(bars, { noData: bars.length === 0 });
          },
          "subscribeBars": function(symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) {
            console.log('Subscribing to bars for', symbolInfo.name);
            // Real-time updates would go here
          },
          "unsubscribeBars": function(subscriberUID) {
            console.log('Unsubscribing from bars');
          }
        }
      }`;
    
    container.current.appendChild(script);
    setWidgetLoaded(true);

    return () => {
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [tradingViewData, timeframe, token]);

  const currentPrice = useMemo(() => {
    if (!tradingViewData?.length) return null;
    const last = tradingViewData[tradingViewData.length - 1];
    return last.close;
  }, [tradingViewData]);

  const priceChange = useMemo(() => {
    if (!tradingViewData?.length) return null;
    const last = tradingViewData[tradingViewData.length - 1];
    const first = tradingViewData[0];
    const change = last.close - first.close;
    const changePercent = (change / first.close) * 100;
    return { change, changePercent };
  }, [tradingViewData]);

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col">
      {/* Custom header with our data */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {token?.symbol?.charAt(0) || 'T'}
              </span>
            </div>
            <div>
              <h2 className="text-white text-lg font-semibold">
                {token?.symbol || 'Token'}
              </h2>
              <p className="text-gray-400 text-sm">
                {displayMode === 'mcap' ? 'Market Cap' : 'Price'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-white text-2xl font-bold">
              ${currentPrice?.toFixed(displayMode === 'mcap' ? 0 : 8) || '--'}
            </span>
            {priceChange && (
              <span className={`text-sm font-medium ${
                priceChange.change >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {priceChange.change >= 0 ? '+' : ''}{priceChange.changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Timeframe selector */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            {[
              { id: '1MIN', label: '1m' },
              { id: '5MIN', label: '5m' },
              { id: '15MIN', label: '15m' },
              { id: '1H', label: '1h' },
              { id: '4H', label: '4h' },
              { id: '1D', label: '1D' },
              { id: '1W', label: '1W' },
              { id: '1M', label: '1M' }
            ].map(tf => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  timeframe === tf.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-600'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Display mode toggle */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setDisplayMode('price')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                displayMode === 'price'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setDisplayMode('mcap')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                displayMode === 'mcap'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
            >
              MCap
            </button>
          </div>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* TradingView widget container */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
            <div className="text-white">Loading TradingView widget...</div>
          </div>
        )}
        <div 
          className="tradingview-widget-container" 
          ref={container} 
          style={{ height: "100%", width: "100%" }}
        >
          <div 
            className="tradingview-widget-container__widget" 
            style={{ height: "calc(100% - 32px)", width: "100%" }}
          />
          <div className="tradingview-widget-copyright">
            <a 
              href="#" 
              rel="noopener nofollow" 
              target="_blank"
              className="text-blue-400 hover:text-blue-300"
            >
              <span className="blue-text">
                {token?.symbol || 'Token'} chart by XTrend
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingViewWidget;
