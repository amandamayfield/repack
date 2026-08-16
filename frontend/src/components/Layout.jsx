import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/authContext";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <nav aria-label="Primary" className="app-nav">
          <NavLink to="/trips">Trips</NavLink>
          <NavLink to="/lists">Lists</NavLink>
        </nav>
        <div className="app-account">
          {user?.username && <span>{user.username}</span>}
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
