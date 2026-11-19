import { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('workzen_token');
    const savedUser = localStorage.getItem('workzen_user');
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      const response = await authService.login(credentials);
      
      if (response.success) {
        const { token, ...userData } = response.data;
        localStorage.setItem('workzen_token', token);
        localStorage.setItem('workzen_user', JSON.stringify(userData));
        setUser(userData);
        return { success: true, data: userData };
      }
      
      return { success: false, message: response.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await authService.register(userData);
      
      if (response.success) {
        const { token, ...user } = response.data;
        localStorage.setItem('workzen_token', token);
        localStorage.setItem('workzen_user', JSON.stringify(user));
        setUser(user);
        return { success: true, data: user };
      }
      
      return { success: false, message: response.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed'
      };
    }
  };

  // Order is load-bearing. The axios request interceptor reads the bearer token
  // out of localStorage when it builds the request, so clearing the token first
  // dispatches an unauthenticated logout that `protect` rejects with 401 and the
  // database session quietly stays live. Awaiting here is what makes server-side
  // revocation actually happen.
  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // A rejected logout is still a logout for the client: the session was
      // already revoked or expired (401), or the request never landed. Local
      // credentials must not survive either way.
    } finally {
      localStorage.removeItem('workzen_token');
      localStorage.removeItem('workzen_user');
      setUser(null);
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
