import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      setUser(null);
    }
  }, []);

  const handle403 = useCallback((err) => {
    if (err?.message === "403") {
      setUser(null);
      return true;
    }
    return false;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, handle403 }),
    [user, loading, login, register, logout, handle403],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
