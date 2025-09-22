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

  // Handle drag movement
  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Constrain to viewport bounds
    const maxX = window.innerWidth - 60; // Button width
    const maxY = window.innerHeight - 60; // Button height

    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
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
    
    if (!isPremium) {
      // Show premium prompt for non-premium users
      alert('AI Chat is a premium feature. Upgrade to access the AI assistant!');
      return;
    }

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
          <path
            d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z"
            fill="currentColor"
          />
          <path
            d="M7 9H17V11H7V9ZM7 12H15V14H7V12Z"
            fill="currentColor"
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
