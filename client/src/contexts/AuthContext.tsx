import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient, getQueryFn } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  username: string;
  autoValidateInbox?: boolean;
  createdAt: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const { data: userData, isLoading } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/login', { email, password });
      return await res.json();
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.setQueryData(['/api/auth/me'], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ email, username, password }: { email: string; username: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/register', { email, username, password });
      return await res.json();
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.setQueryData(['/api/auth/me'], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/logout');
      return await res.json();
    },
    onSuccess: () => {
      setUser(null);
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.clear();
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const register = async (email: string, username: string, password: string) => {
    await registerMutation.mutateAsync({ email, username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
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
