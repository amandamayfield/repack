import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/authContext";

export default function RequireAuth() {
  const { user, signOutReason } = useAuth();
  const location = useLocation();
  if (user) return <Outlet />;
  // Remember the page so signing in returns to it, unless they chose to log out.
  const state = signOutReason === "logout" ? undefined : { from: location };
  return <Navigate to="/login" replace state={state} />;
}
