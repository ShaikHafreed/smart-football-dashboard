import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      const user = localStorage.getItem("fb_user");
      navigate(user ? "/dashboard" : "/login");
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white">

      <div className="text-center space-y-6 animate-fadeIn">

        <h1 className="text-4xl font-extrabold tracking-wide">
          Smart Football ⚽
        </h1>

        <p className="text-sm opacity-80">
          Performance Analytics System
        </p>

        <div className="flex justify-center">
          <div className="h-10 w-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>

      </div>
    </div>
  );
}