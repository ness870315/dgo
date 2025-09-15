import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Smartphone, X } from 'lucide-react';
import pushNotificationService from '../services/pushNotificationService';

const MobilePushNotification = ({ onClose }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRequest, setShowRequest] = useState(false);

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    try {
      const isMobileDevice = pushNotificationService.isMobileDevice();
      const isSupportedDevice = pushNotificationService.isSupported;
      
      setIsMobile(isMobileDevice);
      setIsSupported(isSupportedDevice);
      
      if (isMobileDevice && isSupportedDevice) {
        const status = await pushNotificationService.checkSubscriptionStatus();
        setIsSubscribed(status.subscribed);
        
        // Show request if not subscribed
        if (!status.subscribed) {
          setShowRequest(true);
        }
      }
    } catch (error) {
      console.error('Error checking push notification support:', error);
      setError('Failed to check notification support');
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await pushNotificationService.subscribe();
      setIsSubscribed(true);
      setShowRequest(false);
      console.log('📱 Successfully subscribed to push notifications');
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await pushNotificationService.unsubscribe();
      setIsSubscribed(false);
      console.log('📱 Successfully unsubscribed from push notifications');
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowRequest(false);
    if (onClose) onClose();
  };

  // Don't show anything if not mobile or not supported
  if (!isMobile || !isSupported) {
    return null;
  }

  // Don't show if already subscribed and not showing request
  if (isSubscribed && !showRequest) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Smartphone size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Mobile Notifications</h3>
              <p className="text-gray-400 text-sm">Get notified of KOL calls</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-start space-x-3 mb-4">
            <Bell size={20} className="text-blue-400 mt-1" />
            <div>
              <h4 className="text-white font-medium mb-2">Stay Updated with KOL Calls</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Get instant notifications when other users make KOL calls. 
                Never miss the next alpha opportunity!
              </p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h5 className="text-white font-medium mb-2">What you'll get:</h5>
            <ul className="text-gray-400 text-sm space-y-1">
              <li>• Real-time KOL call notifications</li>
              <li>• Token symbol and market cap info</li>
              <li>• Direct link to token page</li>
              <li>• Works for all users (guests, free, premium)</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          {!isSubscribed ? (
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Enabling...</span>
                </>
              ) : (
                <>
                  <Bell size={16} />
                  <span>Enable Notifications</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleUnsubscribe}
              disabled={isLoading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Disabling...</span>
                </>
              ) : (
                <>
                  <BellOff size={16} />
                  <span>Disable Notifications</span>
                </>
              )}
            </button>
          )}
          
          <button
            onClick={handleDismiss}
            className="px-4 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Maybe Later
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-gray-500 text-xs">
            You can change this setting anytime in your browser
          </p>
        </div>
      </div>
    </div>
  );
};

export default MobilePushNotification;
