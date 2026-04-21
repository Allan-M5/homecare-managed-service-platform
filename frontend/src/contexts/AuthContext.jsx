import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  deleteAccount,
  forgotPasswordRequest,
  getCurrentUserRequest,
  loginRequest,
  recoverAdminAccess
} from "../api/authApi";
import { setAuthToken } from "../api/http";
import { authStorage } from "../lib/storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => authStorage.getAuth());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = authStorage.getToken();

    if (token) {
      setAuthToken(token);
    }

    const bootstrap = async () => {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const response = await getCurrentUserRequest();
        const nextAuth = {
          token,
          user: response.data.user,
          profile: response.data.profile
        };

        setAuth(nextAuth);
        authStorage.setAuth(nextAuth);
      } catch {
        authStorage.clearAll();
        setAuthToken(null);
        setAuth(null);
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, []);

  const login = async (payload) => {
    setIsLoading(true);

    try {
      const response = await loginRequest(payload);
      const loginData = response.data || {};

      if (!loginData.token) {
        return loginData;
      }

      const nextAuth = {
        token: loginData.token,
        user: loginData.user,
        profile: loginData.profile
      };

      setAuthToken(nextAuth.token);
      authStorage.setToken(nextAuth.token);
      authStorage.setAuth(nextAuth);
      setAuth(nextAuth);

      return nextAuth;
    } finally {
      setIsLoading(false);
    }
  };

  const requestForgotPassword = async (email) => {
    return forgotPasswordRequest({ email });
  };

  const handleAdminRecovery = async ({ email, recoveryKey }) => {
    return recoverAdminAccess(email, recoveryKey);
  };

  const logout = () => {
    authStorage.clearAll();
    setAuthToken(null);
    setAuth(null);
  };

  const handleAccountDeletion = async (password, reason) => {
    await deleteAccount({ password, reason });
    authStorage.clearAll();
    setAuthToken(null);
    setAuth(null);
    window.location.href = "/login";
  };

  const refreshCurrentUser = async () => {
    const token = authStorage.getToken();
    if (!token) return null;

    const response = await getCurrentUserRequest();
    const nextAuth = {
      token,
      user: response.data.user,
      profile: response.data.profile
    };

    setAuth(nextAuth);
    authStorage.setAuth(nextAuth);
    return nextAuth;
  };

  const value = useMemo(
    () => ({
      auth,
      user: auth?.user || null,
      profile: auth?.profile || null,
      token: auth?.token || null,
      isAuthenticated: Boolean(auth?.token),
      isBootstrapping,
      isLoading,
      login,
      logout,
      requestForgotPassword,
      handleAdminRecovery,
      handleAccountDeletion,
      refreshCurrentUser
    }),
    [auth, isBootstrapping, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}


