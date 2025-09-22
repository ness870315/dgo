import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './FloatingChatButton.css';

const FloatingChatButton = ({ onOpenChat }) => {
  const { user, isPremium } = useAuth();
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight / 2 - 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const buttonRef = useRef(null);

  // Handle drag start
  const handleMouseDown = (e) => {
    // Only allow dragging for premium users, or if user wants to reposition
    if (!isPremium && !user) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    e.preventDefault();
  };

  // Handle drag movement - optimized for performance
  const handleMouseMove = (e) => {
    if (!isDragging) return;

    // Use requestAnimationFrame for smooth performance
    requestAnimationFrame(() => {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

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
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isDragging, dragStart]);

  // Handle click to open chat
  const handleClick = (e) => {
    if (isDragging) return; // Don't open chat if we were dragging
    
    if (!user) {
      // Show login prompt for guest users
      alert('Please log in to access the AI assistant');
      return;
    }
    
    // 🚨 FIX: Check premium status correctly
    // isPremium should be true for premium users, false for non-premium
    if (user && !isPremium) {
      // Show premium prompt for non-premium users
      alert('AI Chat is a premium feature. Upgrade to access the AI assistant!');
      return;
    }

    // If user is logged in and premium, open chat
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

  return (
    <div
      ref={buttonRef}
      className={`floating-chat-button ${isDragging ? 'dragging' : ''} ${!isPremium && !user ? 'disabled' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : (isPremium || user ? 'grab' : 'not-allowed')
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      title={isPremium || user ? "Drag to reposition • Click to open AI Chat" : "AI Chat requires premium access"}
    >
      <div className="chat-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Robot head icon */}
          <path
            d="M12 2C13.1 2 14 2.9 14 4V6H16C17.1 6 18 6.9 18 8V18C18 19.1 17.1 20 16 20H8C6.9 20 6 19.1 6 18V8C6 6.9 6.9 6 8 6H10V4C10 2.9 10.9 2 12 2Z"
            fill="currentColor"
          />
          {/* Robot eyes */}
          <circle cx="9" cy="10" r="1.5" fill="white"/>
          <circle cx="15" cy="10" r="1.5" fill="white"/>
          {/* Robot mouth */}
          <path
            d="M9 14H15C15.6 14 16 13.6 16 13C16 12.4 15.6 12 15 12H9C8.4 12 8 12.4 8 13C8 13.6 8.4 14 9 14Z"
            fill="white"
          />
        </svg>
      </div>
      
      {/* Premium indicator */}
      {isPremium && (
        <div className="premium-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L15.09 8.26L22 9L17 14L18.18 21L12 17.77L5.82 21L7 14L2 9L8.91 8.26L12 2Z" fill="#FFD700"/>
          </svg>
        </div>
      )}
      
      {/* Pulse animation for premium users */}
      {isPremium && (
        <div className="pulse-ring"></div>
      )}
    </div>
  );
};

export default FloatingChatButton;
