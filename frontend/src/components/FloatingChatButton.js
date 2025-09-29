import React, { useState, useRef, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './FloatingChatButton.css';

const FloatingChatButton = ({ onOpenChat }) => {
  const { user, isPremium } = useAuth();
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 - 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef(null);

  // Handle drag start
  const handleMouseDown = (e) => {
    // Only allow dragging for premium users, or if user wants to reposition
    if (!isPremium && !user) return;
    
    setIsDragging(true);
    setDragStart({
      x: (e.clientX || e.touches?.[0]?.clientX) - position.x,
      y: (e.clientY || e.touches?.[0]?.clientY) - position.y
    });
    e.preventDefault();
  };

  // Handle drag movement - optimized for performance
  const handleMouseMove = (e) => {
    if (!isDragging) return;

    // Use requestAnimationFrame for smooth performance
    requestAnimationFrame(() => {
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      const clientY = e.clientY || e.touches?.[0]?.clientY;
      
      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;

      // Constrain to viewport bounds
      const maxX = window.innerWidth - 60; // Button width
      const maxY = window.innerHeight - 60; // Button height

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    });
  };

  // Handle drag end
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleMouseMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging, dragStart]);

  // Handle click to open chat
  const handleClick = (e) => {
    if (isDragging) return; // Don't open chat if we were dragging
    
    
    // Check premium status (user is guaranteed to be authenticated)
    if (!isPremium) {
      // Show premium prompt for non-premium users
      alert('AI Chat is a premium feature. Upgrade to access the AI assistant!');
      return;
    }

    // If user is premium, open chat
    onOpenChat();
  };

  // Handle window resize to keep button in bounds
  useEffect(() => {
    const handleResize = () => {
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      
      setPosition(prev => ({
        x: Math.min(prev.x, maxX),
        y: Math.min(prev.y, maxY)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Only render for authenticated users
  if (!user) {
    return null;
  }

  return (
    <div
      ref={buttonRef}
      className={`floating-chat-button ${isDragging ? 'dragging' : ''} ${!isPremium ? 'disabled' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : (isPremium ? 'grab' : 'not-allowed')
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="chat-icon">
        <Bot size={20} className="text-white" />
      </div>
      
      {/* Premium indicator - subtle dot instead of star */}
      {isPremium && (
        <div className="premium-indicator">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        </div>
      )}
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="bubble-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
          <div className="text-xs leading-tight">
            <span className="font-semibold text-white">🤖 AI Chat:</span>
            <span className="text-gray-300 ml-1">{isPremium ? "Drag to reposition • Click to open" : "Premium feature - upgrade to access"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingChatButton;
