import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './FloatingChatButton.css';

const FloatingChatButton = ({ onOpenChat }) => {
  const { user, isPremium } = useAuth();
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 - 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const buttonRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle drag start - optimized for both mouse and touch
  const handleDragStart = useCallback((e) => {
    // Only allow dragging for premium users
    if (!isPremium && !user) return;
    
    setIsDragging(true);
    setShowTooltip(false);
    
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    
    setDragStart({
      x: clientX - position.x,
      y: clientY - position.y
    });
    
    e.preventDefault();
    e.stopPropagation();
  }, [isPremium, user, position.x, position.y]);

  // Handle drag movement - optimized for smooth performance
  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;

    // Cancel previous animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      const clientY = e.clientY || e.touches?.[0]?.clientY;
      
      if (clientX === undefined || clientY === undefined) return;
      
      const newX = clientX - dragStart.x;
      const newY = clientY - dragStart.y;

      // Constrain to viewport bounds with proper margins
      const buttonSize = 50;
      const margin = 10;
      const maxX = window.innerWidth - buttonSize - margin;
      const maxY = window.innerHeight - buttonSize - margin;

      setPosition({
        x: Math.max(margin, Math.min(newX, maxX)),
        y: Math.max(margin, Math.min(newY, maxY))
      });
    });
  }, [isDragging, dragStart]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    
    // Cancel any pending animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Add global event listeners for drag - optimized for mobile
  useEffect(() => {
    if (isDragging) {
      // Use passive: false for touch events to allow preventDefault
      document.addEventListener('mousemove', handleDragMove, { passive: false });
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd);
      
      // Prevent scrolling and text selection during drag
      document.body.style.overflow = 'hidden';
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchmove', handleDragMove);
      document.removeEventListener('touchend', handleDragEnd);
      document.body.style.overflow = '';
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
      
      // Clean up animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Handle click to open chat
  const handleClick = useCallback((e) => {
    // Prevent click if we were dragging
    if (isDragging) {
      e.preventDefault();
      return;
    }
    
    // Check premium status
    if (!isPremium) {
      alert('AI Chat is a premium feature. Upgrade to access the AI assistant!');
      return;
    }

    onOpenChat();
  }, [isDragging, isPremium, onOpenChat]);

  // Handle window resize to keep button in bounds
  useEffect(() => {
    const handleResize = () => {
      const buttonSize = 50;
      const margin = 10;
      const maxX = window.innerWidth - buttonSize - margin;
      const maxY = window.innerHeight - buttonSize - margin;
      
      setPosition(prev => ({
        x: Math.max(margin, Math.min(prev.x, maxX)),
        y: Math.max(margin, Math.min(prev.y, maxY))
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
      className={`floating-chat-button ${isDragging ? 'dragging' : ''} ${!isPremium ? 'disabled' : ''} ${isMobile ? 'mobile' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : (isPremium ? 'grab' : 'not-allowed')
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      onClick={handleClick}
      onMouseEnter={() => !isMobile && setShowTooltip(true)}
      onMouseLeave={() => !isMobile && setShowTooltip(false)}
    >
      <div className="chat-icon">
        <Bot size={20} className="text-white" />
      </div>
      
      {/* Premium indicator */}
      {isPremium && (
        <div className="premium-indicator">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        </div>
      )}
      
      {/* Tooltip - only show on desktop */}
      {showTooltip && !isMobile && (
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
