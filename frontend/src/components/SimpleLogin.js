import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const SimpleLogin = ({ onClose }) => {
  const { login } = useAuth();

  const demoUsers = [
    { id: 'demo1', username: 'trader1', displayName: 'Crypto Trader', profileImage: null },
    { id: 'demo2', username: 'hodler', displayName: 'Diamond Hands', profileImage: null },
    { id: 'demo3', username: 'analyst', displayName: 'Market Analyst', profileImage: null }
  ];

  const handleUserSelect = async (user) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com'}/auth/demo-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user.username }),
      });

      const data = await response.json();
      
      if (data.success) {
        login(data.user, data.sessionId, 'demo');
        if (onClose) onClose();
      } else {
        console.error('Demo login failed:', data.message);
      }
    } catch (error) {
      console.error('Demo login error:', error);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400 mb-3">Choose a demo user:</p>
      {demoUsers.map((user) => (
        <button
          key={user.id}
          onClick={() => handleUserSelect(user)}
          className="w-full text-left px-3 py-2 bg-dark-bg border border-gray-600 rounded hover:border-blue-500 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {user.displayName.charAt(0)}
            </div>
            <div>
              <div className="text-white text-sm font-medium">{user.displayName}</div>
              <div className="text-gray-400 text-xs">@{user.username}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SimpleLogin;
