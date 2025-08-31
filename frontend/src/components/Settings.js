import React, { useState } from 'react';
import { Settings as SettingsIcon, X, Twitter, Database, Zap, Shield } from 'lucide-react';

const Settings = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-card border border-solana-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <SettingsIcon className="text-solana-purple" size={24} />
              <h2 className="text-2xl font-bold text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Data Source Settings */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
              <Database className="mr-2 text-solana-purple" size={20} />
              Data Source
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-bg rounded-lg border border-gray-700">
                <div className="flex items-center space-x-3">
                  <Twitter className="text-blue-400" size={20} />
                  <div>
                    <div className="text-white font-medium">Use Real Social Data</div>
                    <div className="text-sm text-gray-400">
                      Fetch live data from CoinGecko, Reddit, GitHub & News (no API keys required!)
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.useRealTwitterData}
                    onChange={(e) => handleSettingChange('useRealTwitterData', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-solana-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-solana-purple"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-dark-bg rounded-lg border border-gray-700">
                <div className="flex items-center space-x-3">
                  <Zap className="text-yellow-400" size={20} />
                  <div>
                    <div className="text-white font-medium">Real-time Updates</div>
                    <div className="text-sm text-gray-400">
                      Automatically refresh data every 5 minutes
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.enableRealTimeUpdates}
                    onChange={(e) => handleSettingChange('enableRealTimeUpdates', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-solana-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-solana-purple"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Analysis Settings */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
              <Shield className="mr-2 text-solana-green" size={20} />
              Analysis Features
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-dark-bg rounded-lg border border-gray-700">
                <div>
                  <div className="text-white font-medium">Sentiment Analysis</div>
                  <div className="text-sm text-gray-400">
                    Analyze tweet sentiment for better scoring
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.enableSentimentAnalysis}
                    onChange={(e) => handleSettingChange('enableSentimentAnalysis', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-solana-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-solana-purple"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-dark-bg rounded-lg border border-gray-700">
                <div>
                  <div className="text-white font-medium">Risk Detection</div>
                  <div className="text-sm text-gray-400">
                    Detect potential scam indicators in mentions
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.enableRiskDetection}
                    onChange={(e) => handleSettingChange('enableRiskDetection', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-solana-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-solana-purple"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Refresh Interval */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-white">Refresh Interval</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Update frequency (minutes)
              </label>
              <select
                value={localSettings.refreshInterval}
                onChange={(e) => handleSettingChange('refreshInterval', parseInt(e.target.value))}
                className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-dark-bg text-white focus:outline-none focus:ring-2 focus:ring-solana-purple focus:border-solana-purple"
              >
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </div>
          </div>

          {/* API Status */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-white">API Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded-lg border border-gray-700">
                <span className="text-white">Alternative Data Sources</span>
                <span className="px-2 py-1 rounded text-xs font-medium bg-green-900 text-green-300">
                  Ready (CoinGecko, Reddit, GitHub, News)
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-dark-bg rounded-lg border border-gray-700">
                <span className="text-white">Solana RPC</span>
                <span className="px-2 py-1 rounded text-xs font-medium bg-green-900 text-green-300">
                  Connected
                </span>
              </div>
            </div>
          </div>

          {/* Configuration Help */}
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
            <h4 className="text-green-300 font-medium mb-2">Alternative Data Sources</h4>
            <p className="text-green-200 text-sm mb-3">
              No setup required! We automatically fetch data from:
            </p>
            <ul className="text-green-200 text-sm space-y-1 ml-4">
              <li>• CoinGecko - Community metrics & social stats</li>
              <li>• Reddit - Real discussions & sentiment analysis</li>
              <li>• GitHub - Development activity & project health</li>
              <li>• News APIs - Media coverage & trending topics</li>
            </ul>
            <p className="text-green-200 text-sm mt-3 font-medium">
              💰 100% Free - No API keys or paid plans required!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
