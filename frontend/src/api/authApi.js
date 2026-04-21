import { http } from "./http";

export const loginRequest = async (payload) => {
  const { data } = await http.post("/api/auth/login", payload);
  return data;
};

export const forgotPasswordRequest = async (payload) => {
  const { data } = await http.post("/api/auth/forgot-password", payload);
  return data;
};

export const getCurrentUserRequest = async () => {
  const { data } = await http.get("/api/auth/me");
  return data;
};

export const changePasswordRequest = async (payload) => {
  const { data } = await http.patch("/api/auth/change-password", payload);
  return data;
};

export const registerClientRequest = async (payload) => {
  const { data } = await http.post("/api/auth/register-client", payload);
  return data;
};

export const deleteAccount = async ({ password, reason }) => {
  const response = await http.post("/api/auth/delete-account", {
    password,
    reason
  });

  return response.data;
};

export const recoverAdminAccess = async (email, recoveryKey) => {
  const { data } = await http.post("/api/auth/recover-admin-access", {
    email,
    recoveryKey
  });
  return data;
};



