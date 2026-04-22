import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import RegisterClientPage from "../pages/RegisterClientPage";
import ApplyWorkerPage from "../pages/ApplyWorkerPage";
import NotFoundPage from "../pages/NotFoundPage";
import AdminDashboardPage from "../pages/admin/AdminDashboardPage";
import ClientDashboardPage from "../pages/client/ClientDashboardPage";
import WorkerDashboardPage from "../pages/worker/WorkerDashboardPage";
import ProtectedRoute from "../components/common/ProtectedRoute";
import { useAuth } from "../contexts/AuthContext";
import Loader from "../components/common/Loader";
import { getRoleHomePath } from "../utils/roleRedirect";

function RootRedirect() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();

  if (isBootstrapping) {
    return <Loader label="Preparing workspace..." />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRoleHomePath(user.role)} replace />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register-client" element={<RegisterClientPage />} />
      <Route path="/apply-worker" element={<ApplyWorkerPage />} />

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["client"]} />}>
        <Route path="/client" element={<ClientDashboardPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["worker"]} />}>
        <Route path="/worker" element={<WorkerDashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

