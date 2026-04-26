import { http } from "./http";

export const getWorkerDashboardRequest = async () => {
  const { data } = await http.get("/api/worker/dashboard");
  return data;
};

export const updateWorkerAvailabilityRequest = async (payload) => {
  const { data } = await http.patch("/api/worker/availability", payload);
  return data;
};

export const updateWorkerLocationRequest = async (payload) => {
  const { data } = await http.patch("/api/worker/location", payload);
  return data;
};

export const getAvailableWorkersRequest = async (jobId) => {
  const { data } = await http.get("/api/worker/available", {
    params: { jobId }
  });
  return data;
};

export const workerHeartbeatRequest = async () => {
  return http.post("/worker/heartbeat");
};
