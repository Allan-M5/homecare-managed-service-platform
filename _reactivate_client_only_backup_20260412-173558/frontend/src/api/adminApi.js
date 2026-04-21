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

export const getPendingWorkerApplicationsRequest = async (params = {}) => {
  const { data } = await http.get("/api/admin/worker-applications", { params });
  return data;
};

export const reviewWorkerApplicationRequest = async (applicationId, payload) => {
  const { data } = await http.patch(`/api/admin/worker-applications/${applicationId}/review`, payload);
  return data;
};
