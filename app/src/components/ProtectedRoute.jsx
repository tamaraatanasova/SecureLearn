import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, roles, adminOnly = false, teacherOnly = false }) {
  const { isAuthed, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="container page">Loading...</div>;
  }

  if (!isAuthed) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  const allowedRoles = roles?.length
    ? roles
    : adminOnly
      ? ["admin"]
      : teacherOnly
        ? ["teacher"]
        : null;

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
