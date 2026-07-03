'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logoutAction } from '@/actions/auth';

export type UserRole = 'admin' | 'management' | 'sales' | 'standard' | 'vault' | 'packaging' | 'agent' | 'grow';

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
    compliance: ['admin', 'management', 'vault', 'packaging'],
    cultivation: ['admin', 'management', 'vault', 'packaging', 'standard', 'grow'],
    tasks: ['admin', 'management', 'sales', 'agent'],
    inventory: ['admin', 'management', 'vault', 'packaging', 'standard', 'sales', 'agent'],
    users: ['admin'],
    finance: ['admin', 'management'],
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
  return ['admin', 'management', 'sales', 'agent'].includes(role);
}

export function canDeleteOrder(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canAssignSales(role: UserRole): boolean {
  return ['sales', 'agent', 'management', 'admin'].includes(role);
}

export function canManageCultivation(role: UserRole): boolean {
  return ['admin', 'management'].includes(role);
}

export function canCompleteCultivation(role: UserRole): boolean {
  return ['admin', 'management', 'vault', 'packaging', 'grow'].includes(role);
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
    const supabase = createClient();

    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // Ignore errors
    }

    supabase.auth.getSession().then(() => {
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Keep session state in sync without altering localStorage auth
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback((newUser: SessionUser) => {
    setUser(newUser);
    setIsLoading(false); // Ensure loading state is cleared after login
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
    // Clear the server-side session cookie so the server can no longer
    // identify this client. Fire-and-forget — UI state is already cleared.
    logoutAction().catch((err) => console.error('logoutAction failed:', err));
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
