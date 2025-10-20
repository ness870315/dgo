import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Buffer } from 'buffer';

// Polyfill Buffer for browser (required by PayAI SDK)
window.Buffer = Buffer;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA Service Worker Registration with Auto-Update
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('📱 PWA: Service Worker registered successfully:', registration.scope);
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('🔄 PWA: Service Worker updated, reloading...', event.data.version);
            // Auto-reload on mobile to get fresh content
            setTimeout(() => {
              window.location.reload();
            }, 100);
          }
        });
        
        // Check for updates periodically (every 60 seconds)
        setInterval(() => {
          registration.update().catch(err => {
            console.log('⚠️ PWA: Update check failed:', err.message);
          });
        }, 60000);
        
        // Check for updates on visibility change (when user returns to tab)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration.update().catch(err => {
              console.log('⚠️ PWA: Update check failed:', err.message);
            });
          }
        });
        
        // Check for updates on install
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 PWA: Update found, installing...');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                console.log('🔄 PWA: New content available, auto-reloading...');
                // Auto-reload immediately for mobile
                window.location.reload();
              } else {
                console.log('✅ PWA: Content cached for offline use');
              }
            }
          });
        });
      })
      .catch((error) => {
        console.log('❌ PWA: Service Worker registration failed:', error);
      });
  });
}

// Add global function to clear PWA cache (for debugging)
window.clearPWACache = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }
      
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }
      
      console.log('🧹 PWA cache cleared successfully');
      alert('PWA cache cleared! The app will reload.');
      window.location.reload();
    } catch (error) {
      console.error('❌ Failed to clear PWA cache:', error);
    }
  }
};

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
