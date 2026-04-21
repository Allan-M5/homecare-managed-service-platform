const TOKEN_KEY = "homecare_token";
const AUTH_KEY = "homecare_auth";

export const authStorage = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },
  getAuth() {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setAuth(value) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(value));
  },
  clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  },
  clearAll() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AUTH_KEY);
  }
};