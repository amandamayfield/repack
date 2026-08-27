import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";

// api() throws Error(String(status)) on a non-2xx response. For both login and
// register the interesting failure is 400 (bad credentials / username taken).
function messageForError(err, mode) {
  if (err?.message === "400") {
    return mode === "login"
      ? "Incorrect username or password."
      : "That username is taken, or the details are invalid.";
  }
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  // Already authenticated (incl. right after a successful submit): skip the form.
  if (user) return <Navigate to="/trips" replace />;

  const isLogin = mode === "login";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
      // On success `user` becomes set and the <Navigate> above redirects.
    } catch (err) {
      setError(messageForError(err, mode));
      setPending(false); // stay on the form to retry; on success we unmount instead
    }
  }

  function switchMode() {
    setMode(isLogin ? "register" : "login");
    setError(null);
  }

  return (
    <main className="auth-page">
      <h1>{isLogin ? "Sign in" : "Create account"}</h1>

      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={pending}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />

        <button type="submit" disabled={pending}>
          {pending
            ? isLogin
              ? "Signing in…"
              : "Creating account…"
            : isLogin
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p>
        {isLogin ? "Need an account?" : "Already have an account?"}{" "}
        <button type="button" className="link-button" onClick={switchMode} disabled={pending}>
          {isLogin ? "Create one" : "Sign in"}
        </button>
      </p>
    </main>
  );
}
