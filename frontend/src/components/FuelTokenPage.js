import React, { useState, useEffect } from 'react';
import { Flame, Rocket, Zap, Gem, ArrowLeft } from 'lucide-react';

const FuelTokenPage = ({ onBack }) => {
  const [selectedFuel, setSelectedFuel] = useState(null);
  const [contractAddress, setContractAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [fueledTokens, setFueledTokens] = useState([]);

  const fuelOptions = [
    { type: '10x', icon: '🚀', boost: '15%', multiplier: 1.15 },
    { type: '50x', icon: '🔥', boost: '25%', multiplier: 1.25 },
    { type: '500x', icon: '⚡', boost: '35%', multiplier: 1.35 },
    { type: '1000x', icon: '💎', boost: '45%', multiplier: 1.45 }
  ];

  useEffect(() => {
    loadFueledTokens();
    const interval = setInterval(loadFueledTokens, 30000);
    return () => clearInterval(interval);
  }, []);



  const loadFueledTokens = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/tokens/fuel');
      if (response.ok) {
        const data = await response.json();
        setFueledTokens(data.value || data);
      }
    } catch (error) {
      console.error('Error loading fueled tokens:', error);
    }
  };

  const handleFuelSelect = (fuelType) => {
    setSelectedFuel(fuelType);
  };

  const handleApplyFuel = async () => {
    if (!contractAddress.trim()) {
      setMessage({ text: 'Please enter a contract address', type: 'error' });
      return;
    }

    if (!selectedFuel) {
      setMessage({ text: 'Please select a fuel type', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await fetch('http://localhost:4000/api/tokens/fuel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractAddress: contractAddress.trim(),
          fuelType: selectedFuel
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ text: `✅ ${result.message}`, type: 'success' });
        setContractAddress('');
        setSelectedFuel(null);
        loadFueledTokens();
      } else {
        setMessage({ text: `❌ ${result.error}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error applying fuel:', error);
      setMessage({ text: '❌ Failed to apply fuel. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (remainingTime) => {
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m left`;
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="bg-dark-card border-b border-solana-purple px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">🔥 Fuel Token Dashboard</h1>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back to Main App
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Fuel Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {fuelOptions.map((fuel) => (
            <div
              key={fuel.type}
              onClick={() => handleFuelSelect(fuel.type)}
              className={`bg-dark-card border-2 rounded-lg p-6 text-center cursor-pointer transition-all duration-300 hover:scale-105 ${
                selectedFuel === fuel.type
                  ? 'border-orange-500 bg-orange-900 bg-opacity-20'
                  : 'border-gray-700 hover:border-orange-400'
              }`}
            >
              <div className="text-4xl mb-3">{fuel.icon}</div>
              <div className="text-xl font-bold text-white mb-2">Fuel {fuel.type}</div>
              <div className="text-gray-400 text-sm">Duration: 12 hours</div>
            </div>
          ))}
        </div>

        {/* Fuel Application Form */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Rocket size={20} />
            Apply Fuel to Token
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Contract Address (CA):
              </label>
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="Enter Solana contract address..."
                className="w-full px-4 py-3 bg-dark-bg border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Selected Fuel Type:
              </label>
              <input
                type="text"
                value={selectedFuel || ''}
                readOnly
                placeholder="Click on a fuel option above"
                className="w-full px-4 py-3 bg-dark-bg border border-gray-600 rounded-lg text-white placeholder-gray-400"
              />
            </div>
          </div>
          
          <button
            onClick={handleApplyFuel}
            disabled={!selectedFuel || !contractAddress.trim() || loading}
            className="mt-6 w-full md:w-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-lg transition-all duration-300 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-orange-500 disabled:hover:to-red-500"
          >
            {loading ? 'Applying Fuel...' : 'Apply Fuel'}
          </button>
        </div>

        {/* Message Display */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-900 bg-opacity-20 border-green-500 text-green-400'
              : 'bg-red-900 bg-opacity-20 border-red-500 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Currently Fueled Tokens */}
        <div className="bg-dark-card border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Flame size={20} />
            Currently Fueled Tokens
          </h3>
          
          {fueledTokens.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-6xl mb-4">🚫</div>
              <div className="text-lg mb-2">No tokens are currently fueled</div>
              <div className="text-sm">Apply fuel to see tokens here</div>
            </div>
          ) : (
            <div className="space-y-4">
              {fueledTokens.map((token, index) => (
                <div key={index} className="bg-dark-bg border border-gray-600 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="text-lg font-bold text-yellow-400">{token.symbol}</div>
                      <div className="text-gray-400">{token.name || 'Unknown'}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm text-gray-400">Original Score</div>
                      <div className="text-white">{token.originalScore}</div>
                    </div>
                    
                                         <div className="text-center">
                       <div className="text-sm text-gray-400">Total Boost</div>
                       <div className="text-yellow-400 font-bold">{token.totalBoost || token.boostMultiplier}x</div>
                     </div>
                    
                    <div className="text-center">
                      <div className="text-sm text-gray-400">Time Remaining</div>
                      <div className="text-orange-400">{formatTimeRemaining(token.remainingTime)}</div>
                    </div>
                    
                                         <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                       {token.fuelTypes ? token.fuelTypes.join(' + ') : token.fuelType}
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FuelTokenPage;
