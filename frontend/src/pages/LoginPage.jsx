import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/authContext";

// Placeholder — the real login/register form is built in Step 5.
// Already-authenticated users never need this screen.
export default function LoginPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/trips" replace />;

  return (
    <main>
      <h1>Sign in</h1>
      <p>Login form coming in Step 5.</p>
    </main>
  );
}
