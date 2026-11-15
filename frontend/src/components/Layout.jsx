import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/authContext";

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/trips" className="wordmark">
          RePack
        </Link>
        <nav aria-label="Primary" className="app-nav">
          <NavLink to="/trips">Trips</NavLink>
          <NavLink to="/lists">Lists</NavLink>
          <NavLink to="/categories">Categories</NavLink>
        </nav>
        <div className="app-account">
          {user?.username && (
            <span className="app-account__name">{user.username}</span>
          )}
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
