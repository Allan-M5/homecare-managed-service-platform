import { http } from "./http";

export const updateMyClientProfileRequest = async (payload) => {
  const { data } = await http.patch("/api/profile/client/me", payload);
  return data;
};

export const updateMyWorkerProfileRequest = async (payload) => {
  const { data } = await http.patch("/api/profile/worker/me", payload);
  return data;
};

export const adminOverrideClientProfileRequest = async (userId, payload) => {
  const { data } = await http.patch(`/api/profile/admin/client/${userId}`, payload);
  return data;
};

export const adminOverrideWorkerProfileRequest = async (userId, payload) => {
  const { data } = await http.patch(`/api/profile/admin/worker/${userId}`, payload);
  return data;
};
