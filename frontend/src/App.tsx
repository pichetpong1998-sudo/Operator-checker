import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import Login from "./pages/Login";
import OperatorHome from "./pages/OperatorHome";
import ChecklistPage from "./pages/ChecklistPage";
import EngineerDashboard from "./pages/EngineerDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminGeofences from "./pages/AdminGeofences";
import AdminAudit from "./pages/AdminAudit";
import type { UserRole } from "./types";

function RequireRole({ roles, children }: { roles: UserRole[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          user ? (
            user.role === "operator" ? (
              <Navigate to="/operator" replace />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/operator"
        element={
          <RequireRole roles={["operator", "engineer", "admin"]}>
            <OperatorHome />
          </RequireRole>
        }
      />
      <Route
        path="/operator/checklist/:beltHeadCode"
        element={
          <RequireRole roles={["operator", "engineer", "admin"]}>
            <ChecklistPage />
          </RequireRole>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RequireRole roles={["engineer", "admin"]}>
            <EngineerDashboard />
          </RequireRole>
        }
      />

      <Route
        path="/admin/users"
        element={
          <RequireRole roles={["admin"]}>
            <AdminUsers />
          </RequireRole>
        }
      />
      <Route
        path="/admin/geofences"
        element={
          <RequireRole roles={["admin"]}>
            <AdminGeofences />
          </RequireRole>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <RequireRole roles={["admin"]}>
            <AdminAudit />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
