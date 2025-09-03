import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [sessionId, setSessionId] = useState(localStorage.getItem('sessionId'));

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://api.degen-oracle.com';

  // Check for auth callback in URL params (from OAuth X callback)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const authSessionId = urlParams.get('sessionId');
    const authMessage = urlParams.get('message');
    
    if (authSessionId && authStatus === 'success') {
      localStorage.setItem('sessionId', authSessionId);
      setSessionId(authSessionId);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authStatus === 'error') {
      console.error('Authentication failed:', authMessage);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Get user info when session changes
  useEffect(() => {
    const getCurrentUser = async () => {
      const authType = localStorage.getItem('authType');
      const demoSessionId = localStorage.getItem('demoSessionId');
      
      // Check for demo session first
      if (authType === 'demo' && demoSessionId) {
        // For demo sessions, we don't need to fetch from server
        // User data should already be set, just ensure we're authenticated
        if (!user) {
          // Demo session exists but no user data - session might be invalid
          localStorage.removeItem('demoSessionId');
          localStorage.removeItem('authType');
        }
        setLoading(false);
        return;
      }
      
      // Handle OAuth X session
      if (!sessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/validate?sessionId=${sessionId}`);

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Session might be invalid
          localStorage.removeItem('sessionId');
          setSessionId(null);
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        localStorage.removeItem('sessionId');
        setSessionId(null);
      }
      
      setLoading(false);
    };

    getCurrentUser();
  }, [sessionId, user, API_BASE]);

  const login = (userData = null, sessionId = null, authType = 'x') => {
    if (authType === 'demo' && userData && sessionId) {
      // Demo login - set user data directly
      setUser(userData);
      localStorage.setItem('demoSessionId', sessionId);
      localStorage.setItem('authType', 'demo');
    } else {
      // OAuth X login
      window.location.href = `${API_BASE}/auth/x`;
    }
  };

  const logout = async () => {
    const authType = localStorage.getItem('authType');
    
    if (authType === 'demo') {
      // Demo logout - just clear local storage
      localStorage.removeItem('demoSessionId');
      localStorage.removeItem('authType');
    } else {
      // OAuth X logout
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId: sessionId })
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
      localStorage.removeItem('sessionId');
    }
    
    setToken(null);
    setSessionId(null);
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  const value = {
    user,
    token,
    sessionId,
    loading,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
