import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const user = localStorage.getItem("fb_user");

  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
}