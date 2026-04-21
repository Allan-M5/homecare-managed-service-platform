import { http } from "./http";

export const getClientDirectoryRequest = async (params = {}) => {
  const { data } = await http.get("/api/admin/directory/clients", { params });
  return data;
};

export const getWorkerDirectoryRequest = async (params = {}) => {
  const { data } = await http.get("/api/admin/directory/workers", { params });
  return data;
};

export const suspendWorkerAccountRequest = async (workerId, payload) => {
  const { data } = await http.patch(`/api/admin/directory/workers/${workerId}/suspend`, payload);
  return data;
};

export const reactivateWorkerAccountRequest = async (workerId, payload) => {
  const { data } = await http.patch(`/api/admin/directory/workers/${workerId}/reactivate`, payload);
  return data;
};

export const deleteWorkerAccountRequest = async (workerId, payload) => {
  const { data } = await http.delete(`/api/admin/directory/workers/${workerId}`, { data: payload });
  return data;
};

export const deleteClientAccountRequest = async (clientId, payload) => {
  const { data } = await http.patch(`/api/admin/directory/clients/${clientId}/delete`, payload);
  return data;
};


export const reactivateClientAccountRequest = async (clientId, payload) => {
  const { data } = await http.patch(`/api/admin/directory/clients/${clientId}/reactivate`, payload);
  return data;
};

export const getPendingWorkerApplicationsRequest = async (params = {}) => {
  const { data } = await http.get("/api/admin/worker-applications", { params });
  return data;
};

export const reviewWorkerApplicationRequest = async (applicationId, payload) => {
  const { data } = await http.patch(`/api/admin/worker-applications/${applicationId}/review`, payload);
  return data;
};


export const listAdminAccountsRequest = async () => {
  const { data } = await http.get("/api/admin/accounts");
  return data;
};

export const createAdminOperatorRequest = async (payload) => {
  const { data } = await http.post("/api/admin/accounts", payload);
  return data;
};

export const resetAdminOperatorPasswordRequest = async (adminId, payload) => {
  const { data } = await http.patch(`/api/admin/accounts/${adminId}/reset-password`, payload);
  return data;
};

export const deactivateAdminOperatorRequest = async (adminId, payload) => {
  const { data } = await http.patch(`/api/admin/accounts/${adminId}/deactivate`, payload);
  return data;
};

export const reactivateAdminOperatorRequest = async (adminId, payload) => {
  const { data } = await http.patch(`/api/admin/accounts/${adminId}/reactivate`, payload);
  return data;
};

export const adminResetWorkerPasswordRequest = async (workerId, payload = {}) => {
  const response = await http.post(`/api/admin/accounts/reset-worker-password/${workerId}`, payload);
  return response;
};
export const adminSuspendClientAccountRequest = async (clientId, payload) => {
  const response = await http.post(`/api/admin/accounts/suspend-client/${clientId}`, payload);
  return response;
};

export const adminResetClientPasswordRequest = async (clientId, payload) => {
  const response = await http.post(`/api/admin/accounts/reset-client-password/${clientId}`, payload);
  return response;
};