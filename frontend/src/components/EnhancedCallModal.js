import React, { useState, useEffect } from 'react';
import { X, Twitter, Brain, Share2, CheckCircle, AlertCircle } from 'lucide-react';
import twitterService from '../services/twitterService';

const EnhancedCallModal = ({ 
  isOpen, 
  onClose, 
  token, 
  onConfirmCall, 
  onNavigateToPremium 
}) => {
  const [thesis, setThesis] = useState('');
  const [thesisLoading, setThesisLoading] = useState(false);
  const [thesisError, setThesisError] = useState(null);
  const [twitterEnabled, setTwitterEnabled] = useState(false);
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [selectedTone, setSelectedTone] = useState('bullish');
  const [callLoading, setCallLoading] = useState(false);

  const tones = [
    { value: 'bullish', label: 'Bullish', description: 'Confident and enthusiastic' },
    { value: 'cautious', label: 'Cautious', description: 'Measured but optimistic' },
    { value: 'technical', label: 'Technical', description: 'Data-driven analysis' },
    { value: 'narrative', label: 'Narrative', description: 'Community-focused' }
  ];

  useEffect(() => {
    if (isOpen && token) {
      loadTwitterStatus();
      generateThesis();
    }
  }, [isOpen, token]);

  // Regenerate thesis when tone changes
  useEffect(() => {
    if (isOpen && token && thesis) {
      generateThesis();
    }
  }, [selectedTone]);

  const loadTwitterStatus = async () => {
    try {
      const enabled = await twitterService.getTwitterPostingStatus();
      setTwitterEnabled(enabled);
    } catch (error) {
      console.error('Failed to load Twitter status:', error);
    }
  };

  const generateThesis = async () => {
    if (!token) return;
    
    setThesisLoading(true);
    setThesisError(null);
    
    try {
      const sessionId = localStorage.getItem('sessionId');
      const tokenData = {
        symbol: token.symbol,
        name: token.name,
        marketCap: token.marketCap || 0,
        price: token.price || 0,
        jupiterData: token.jupiterData,
        twitterData: token.twitterData
      };
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/api/user/generate-thesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          sessionId,
          tokenData,
          tone: selectedTone
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate thesis');
      }
      
      const result = await response.json();
      setThesis(result.thesis);
    } catch (error) {
      setThesisError('Failed to generate thesis');
      console.error('Thesis generation error:', error);
    } finally {
      setThesisLoading(false);
    }
  };

  const handleTwitterToggle = async (enabled) => {
    setTwitterLoading(true);
    try {
      await twitterService.setTwitterPostingEnabled(enabled);
      setTwitterEnabled(enabled);
    } catch (error) {
      console.error('Failed to update Twitter preference:', error);
      alert('Failed to update Twitter posting preference');
    } finally {
      setTwitterLoading(false);
    }
  };

  const handleConfirmCall = async () => {
    setCallLoading(true);
    try {
      await onConfirmCall({
        token,
        thesis,
        twitterEnabled,
        tone: selectedTone
      });
      onClose();
    } catch (error) {
      console.error('Call confirmation error:', error);
    } finally {
      setCallLoading(false);
    }
  };

  if (!isOpen || !token) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      
      <div className="relative bg-dark-card border border-gray-700 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {token.symbol?.slice(0, 3)}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                Make Your Call
              </h2>
              <p className="text-gray-400 text-sm">
                {token.name} • ${(token.marketCap / 1000000).toFixed(1)}M MC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Thesis Generation */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <Brain size={18} className="text-purple-400" />
              AI-Generated Thesis
            </h3>
            <div className="flex gap-2">
              {tones.map(tone => (
                <button
                  key={tone.value}
                  onClick={() => setSelectedTone(tone.value)}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    selectedTone === tone.value
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tone.label}
                </button>
              ))}
            </div>
          </div>

          {thesisLoading ? (
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full"></div>
                <span className="text-gray-300">Generating thesis...</span>
              </div>
            </div>
          ) : thesisError ? (
            <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-red-400" />
                <span className="text-red-300">{thesisError}</span>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
              <p className="text-gray-200 leading-relaxed">{thesis}</p>
            </div>
          )}

          <button
            onClick={generateThesis}
            disabled={thesisLoading}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {thesisLoading ? 'Generating...' : 'Regenerate Thesis'}
          </button>
        </div>

        {/* Twitter Posting Settings */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-3">
            <Twitter size={18} className="text-blue-400" />
            Twitter Posting
          </h3>
          
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-200 font-medium">Auto-post to Twitter</p>
                <p className="text-gray-400 text-sm">
                  Automatically post your call and milestone updates to Twitter
                </p>
              </div>
              <button
                onClick={() => handleTwitterToggle(!twitterEnabled)}
                disabled={twitterLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  twitterEnabled ? 'bg-blue-600' : 'bg-gray-600'
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    twitterEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            {twitterEnabled && (
              <div className="mt-3 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-blue-400" />
                  <span className="text-blue-300 text-sm">
                    Your call will be posted to Twitter automatically
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Call Preview */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-3">
            <Share2 size={18} className="text-green-400" />
            Call Preview
          </h3>
          
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Token:</span>
                <span className="text-white font-medium">${token.symbol}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Market Cap:</span>
                <span className="text-white font-medium">${(token.marketCap / 1000000).toFixed(1)}M</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Tone:</span>
                <span className="text-white font-medium capitalize">{selectedTone}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Twitter:</span>
                <span className={`font-medium ${twitterEnabled ? 'text-green-400' : 'text-gray-400'}`}>
                  {twitterEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmCall}
            disabled={callLoading || thesisLoading || !thesis}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {callLoading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                Making Call...
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Make Call
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedCallModal;
