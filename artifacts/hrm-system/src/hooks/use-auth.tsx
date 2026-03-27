import React, { createContext, useContext, useState, useEffect } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { login as apiLogin, getCurrentUser } from "@workspace/api-client-react";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  employeeId?: number | null;
  phone?: string | null;
  mobile?: string | null;
  cnic?: string | null;
  profilePicture?: string | null;
  status?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("hrm_token"));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("hrm_token"));
  }, []);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const userData = await getCurrentUser();
        setUser(userData as User);
      } catch (error) {
        console.error("Failed to load user:", error);
        localStorage.removeItem("hrm_token");
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [token]);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await apiLogin(credentials);
    localStorage.setItem("hrm_token", res.token);
    setToken(res.token);
    setUser(res.user as User);
  };

  const logout = () => {
    localStorage.removeItem("hrm_token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData as User);
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
