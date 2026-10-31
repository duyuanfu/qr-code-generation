'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserInfo {
  id: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (data: UserInfo, token?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthModalOpen: false,
  openAuthModal: () => {},
  closeAuthModal: () => {},
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const refreshUser = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/auth/me', { headers });
      const data = await res.json();
      if (data.success && data.data) {
        setUser(data.data);
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (userInfo: UserInfo, token?: string) => {
    setUser(userInfo);
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
    setIsAuthModalOpen(false);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (ignored) {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
