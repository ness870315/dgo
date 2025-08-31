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

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

  // Check for auth token in URL params (from Twitter OAuth callback)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('token');
    const authStatus = urlParams.get('auth');
    
    if (authToken && authStatus === 'success') {
      localStorage.setItem('authToken', authToken);
      setToken(authToken);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (authStatus === 'failed') {
      console.error('Authentication failed');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Get user info when token changes
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
      
      // Handle Twitter OAuth token
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/user`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Token might be invalid
          localStorage.removeItem('authToken');
          setToken(null);
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        localStorage.removeItem('authToken');
        setToken(null);
      }
      
      setLoading(false);
    };

    getCurrentUser();
  }, [token, user, API_BASE]);

  const login = (userData = null, sessionId = null, authType = 'twitter') => {
    if (authType === 'demo' && userData && sessionId) {
      // Demo login - set user data directly
      setUser(userData);
      localStorage.setItem('demoSessionId', sessionId);
      localStorage.setItem('authType', 'demo');
    } else {
      // Twitter OAuth login
      window.location.href = `${API_BASE}/auth/twitter`;
    }
  };

  const logout = async () => {
    const authType = localStorage.getItem('authType');
    
    if (authType === 'demo') {
      // Demo logout - just clear local storage
      localStorage.removeItem('demoSessionId');
      localStorage.removeItem('authType');
    } else {
      // Twitter OAuth logout
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
      localStorage.removeItem('authToken');
    }
    
    setToken(null);
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  const value = {
    user,
    token,
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
