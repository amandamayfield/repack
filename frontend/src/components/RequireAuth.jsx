import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/authContext";

export default function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
