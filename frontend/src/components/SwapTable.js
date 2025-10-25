import React, { useState, useEffect } from 'react';
import { ExternalLink, Filter, TrendingUp, TrendingDown, Plus, Minus } from 'lucide-react';

const SwapTable = React.memo(({ token, realTimeData }) => {
  const [swaps, setSwaps] = useState([]);
  const [filteredSwaps, setFilteredSwaps] = useState([]);
  const [displayedSwaps, setDisplayedSwaps] = useState([]);
  const [filters, setFilters] = useState({
    type: 'ALL',
    usdMin: 0,
    maker: ''
  });
  const [selectedMaker, setSelectedMaker] = useState(null);
  const [showMakerHistory, setShowMakerHistory] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [swapsPerPage] = useState(20); // Show 20 swaps per page

  // Update swaps when real-time data changes
  useEffect(() => {
    if (realTimeData?.swapHistory) {
      // Use full swap history instead of just recentSwaps
      setSwaps(realTimeData.swapHistory);
      console.log(`📊 [SwapTable] Loaded ${realTimeData.swapHistory.length} total swaps`);
    } else if (realTimeData?.recentSwaps) {
      // Fallback to recentSwaps if swapHistory not available
      setSwaps(realTimeData.recentSwaps);
      console.log(`📊 [SwapTable] Loaded ${realTimeData.recentSwaps.length} recent swaps`);
    }
  }, [realTimeData]);

  // Apply filters
  useEffect(() => {
    let filtered = [...swaps];

    // Type filter
    if (filters.type !== 'ALL') {
      filtered = filtered.filter(swap => swap.type === filters.type);
    }

    // USD amount filter
    if (filters.usdMin > 0) {
      filtered = filtered.filter(swap => swap.usdAmount >= filters.usdMin);
    }

    // Maker filter
    if (filters.maker) {
      filtered = filtered.filter(swap => 
        swap.maker.toLowerCase().includes(filters.maker.toLowerCase())
      );
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    setFilteredSwaps(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [swaps, filters]);

  // Pagination logic
  useEffect(() => {
    const startIndex = (currentPage - 1) * swapsPerPage;
    const endIndex = startIndex + swapsPerPage;
    setDisplayedSwaps(filteredSwaps.slice(startIndex, endIndex));
  }, [filteredSwaps, currentPage, swapsPerPage]);

  const getSwapIcon = (type) => {
    switch (type) {
      case 'Buy': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'Sell': return <TrendingDown className="w-4 h-4 text-red-400" />;
      case 'Add': return <Plus className="w-4 h-4 text-blue-400" />;
      case 'Remove': return <Minus className="w-4 h-4 text-orange-400" />;
      default: return <div className="w-4 h-4 bg-gray-400 rounded-full" />;
    }
  };

  const getSwapColor = (type) => {
    switch (type) {
      case 'Buy': return 'text-green-400';
      case 'Sell': return 'text-red-400';
      case 'Add': return 'text-blue-400';
      case 'Remove': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatTokenAmount = (amount) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toFixed(0);
  };

  const handleMakerClick = (maker) => {
    setSelectedMaker(maker);
    setShowMakerHistory(true);
    setFilters(prev => ({ ...prev, maker }));
  };

  const clearMakerFilter = () => {
    setSelectedMaker(null);
    setShowMakerHistory(false);
    setFilters(prev => ({ ...prev, maker: '' }));
  };

  const getUniqueMakers = () => {
    return [...new Set(swaps.map(swap => swap.maker))];
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          🔄 Live Swap Activity
          <span className="ml-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full animate-pulse">
            LIVE
          </span>
        </h3>
        <div className="text-sm text-gray-400">
          Showing {displayedSwaps.length} of {filteredSwaps.length} swaps (Total: {swaps.length})
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        {/* Type Filter */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Type</label>
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600"
          >
            <option value="ALL">All Types</option>
            <option value="Buy">Buy</option>
            <option value="Sell">Sell</option>
            <option value="Add">Add Liquidity</option>
            <option value="Remove">Remove Liquidity</option>
          </select>
        </div>

        {/* USD Amount Filter */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Min USD</label>
          <select
            value={filters.usdMin}
            onChange={(e) => setFilters(prev => ({ ...prev, usdMin: parseInt(e.target.value) }))}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-gray-600"
          >
            <option value={0}>All Amounts</option>
            <option value={100}>$100+</option>
            <option value={500}>$500+</option>
            <option value={1000}>$1,000+</option>
            <option value={5000}>$5,000+</option>
          </select>
        </div>

        {/* Maker Filter */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Maker</label>
          <div className="flex">
            <input
              type="text"
              placeholder="Filter by maker..."
              value={filters.maker}
              onChange={(e) => setFilters(prev => ({ ...prev, maker: e.target.value }))}
              className="flex-1 bg-gray-700 text-white rounded-l px-3 py-2 text-sm border border-gray-600"
            />
            {filters.maker && (
              <button
                onClick={clearMakerFilter}
                className="px-2 py-2 bg-gray-600 text-white rounded-r border border-gray-600 hover:bg-gray-500"
              >
                <Filter className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Maker History Button */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Actions</label>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMakerHistory(!showMakerHistory);
              }}
              className={`w-full px-3 py-2 text-sm rounded border ${
                showMakerHistory 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
              }`}
            >
            {showMakerHistory ? 'Hide' : 'Show'} Maker History
          </button>
        </div>
      </div>

      {/* Swap Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-gray-300">Type</th>
              <th className="px-3 py-2 text-left text-gray-300">Time</th>
              <th className="px-3 py-2 text-right text-gray-300">Token Amount</th>
              <th className="px-3 py-2 text-right text-gray-300">SOL Amount</th>
              <th className="px-3 py-2 text-right text-gray-300">USD Value</th>
              <th className="px-3 py-2 text-left text-gray-300">Maker</th>
              <th className="px-3 py-2 text-left text-gray-300">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {displayedSwaps.map((swap, index) => (
              <tr 
                key={`${swap.txn}-${index}`}
                className={`border-b border-gray-700 hover:bg-gray-700/50 transition-all duration-300 ${
                  index === 0 ? 'animate-pulse bg-green-900/20' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center space-x-2">
                    {getSwapIcon(swap.type)}
                    <span className={getSwapColor(swap.type)}>
                      {swap.type}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {formatTimestamp(swap.timestamp)}
                </td>
                <td className="px-3 py-2 text-right text-white">
                  {formatTokenAmount(swap.tokenAmount)}
                </td>
                <td className="px-3 py-2 text-right text-white">
                  {swap.solAmount.toFixed(3)} SOL
                </td>
                <td className="px-3 py-2 text-right text-white font-semibold">
                  ${swap.usdAmount.toFixed(2)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-400 font-mono text-xs">
                      {swap.maker.slice(0, 6)}...{swap.maker.slice(-4)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMakerClick(swap.maker);
                      }}
                      className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500 transition-colors"
                    >
                      <Filter className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://solscan.io/tx/${swap.txn}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <span className="font-mono text-xs">
                      {swap.txn.slice(0, 8)}...{swap.txn.slice(-6)}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Maker History Modal */}
      {showMakerHistory && selectedMaker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                Maker History: {selectedMaker.slice(0, 8)}...{selectedMaker.slice(-4)}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMakerHistory(false);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-300">Type</th>
                    <th className="px-3 py-2 text-left text-gray-300">Time</th>
                    <th className="px-3 py-2 text-right text-gray-300">USD Value</th>
                    <th className="px-3 py-2 text-left text-gray-300">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {swaps
                    .filter(swap => swap.maker === selectedMaker)
                    .map((swap, index) => (
                      <tr key={index} className="border-b border-gray-700">
                        <td className="px-3 py-2">
                          <div className="flex items-center space-x-2">
                            {getSwapIcon(swap.type)}
                            <span className={getSwapColor(swap.type)}>
                              {swap.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {formatTimestamp(swap.timestamp)}
                        </td>
                        <td className="px-3 py-2 text-right text-white font-semibold">
                          ${swap.usdAmount.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`https://solscan.io/tx/${swap.txn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-blue-400 hover:text-blue-300"
                          >
                            <span className="font-mono text-xs">
                              {swap.txn.slice(0, 8)}...{swap.txn.slice(-6)}
                            </span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredSwaps.length > swapsPerPage && (
        <div className="flex justify-between items-center mt-4 px-4 py-2 bg-gray-800 rounded">
          <div className="text-sm text-gray-400">
            Page {currentPage} of {Math.ceil(filteredSwaps.length / swapsPerPage)}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPage(prev => Math.max(1, prev - 1));
              }}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
            >
              Previous
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPage(prev => Math.min(Math.ceil(filteredSwaps.length / swapsPerPage), prev + 1));
              }}
              disabled={currentPage === Math.ceil(filteredSwaps.length / swapsPerPage)}
              className="px-3 py-1 bg-gray-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {filteredSwaps.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No swaps found matching your filters
        </div>
      )}
    </div>
  );
});

export default SwapTable;
