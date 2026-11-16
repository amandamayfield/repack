import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Why the user is signed out: "expired" (a 401 while signed in), "logout"
  // (they chose to), or null (never signed in this visit).
  const [signOutReason, setSignOutReason] = useState(null);
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Any 401 from any request means the session ended: drop the user, and
  // RequireAuth sends them to /login. The first /auth/me/ 401 on a fresh visit
  // isn't an expiry, which is why this checks there was a user.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) setSignOutReason("expired");
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let active = true;
    api("/auth/me/")
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const u = await api("/auth/login/", {
      method: "POST",
      body: { username, password },
    });
    setSignOutReason(null);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (username, password) => {
      await api("/auth/register/", {
        method: "POST",
        body: { username, password },
      });
      return login(username, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout/", { method: "POST" });
    } finally {
      setSignOutReason("logout");
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signOutReason, login, register, logout }),
    [user, loading, signOutReason, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
