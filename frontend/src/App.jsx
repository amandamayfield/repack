import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/authContext";
import RequireAuth from "./components/RequireAuth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import TripsPage from "./pages/TripsPage";
import TripPage from "./pages/TripPage";
import ListsPage from "./pages/ListsPage";
import ListEditorPage from "./pages/ListEditorPage";

export default function App() {
  const { loading } = useAuth();

  if (loading) return <p role="status">Loading…</p>;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/trips" replace />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/:id" element={<TripPage />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/lists/:id" element={<ListEditorPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/trips" replace />} />
    </Routes>
  );
}
