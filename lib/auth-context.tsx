'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type UserRole = 'admin' | 'management' | 'sales' | 'standard' | 'vault' | 'packaging' | 'agent';

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

// Permission helper functions
export function canViewSection(role: UserRole, section: string): boolean {
  const permissions: Record<string, UserRole[]> = {
    // Admin and management see everything
    vault: ['admin', 'management', 'vault', 'standard'],
    packaging: ['admin', 'management', 'packaging', 'standard'],
    dispensaries: ['admin', 'management', 'sales', 'agent'],
    orders: ['admin', 'management', 'sales', 'agent'],
    products: ['admin', 'management', 'vault', 'packaging', 'standard'],
    communications: ['admin', 'management', 'sales', 'agent'],
    tasks: ['admin', 'management', 'sales', 'agent'],
    users: ['admin'],
  };
  return permissions[section]?.includes(role) ?? false;
}

export function canCreateOrder(role: UserRole): boolean {
  return ['admin', 'management', 'sales'].includes(role);
}

export function canApproveOrder(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
}

export function canEditOrder(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
}

export function canDeleteOrder(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canAssignSales(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
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
