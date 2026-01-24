'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: SessionUser | null;
  isLoading: boolean;
  login: (user: SessionUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'crm-user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // Ignore errors
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((newUser: SessionUser) => {
    setUser(newUser);
    setIsLoading(false); // Ensure loading state is cleared after login
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
