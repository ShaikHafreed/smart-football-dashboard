import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      const name = localStorage.getItem("name");
      const dob = localStorage.getItem("dob");

      if (!name) navigate("/onboarding/name");
      else if (!dob) navigate("/onboarding/dob");
      else navigate("/login");
    }, 1800);

    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 text-white">
      <div className="text-center space-y-6 animate-fadeIn">
        <div className="text-6xl animate-bounce">⚽</div>

        <h1 className="text-3xl font-bold tracking-wide">
          Smart Football
        </h1>

        {/* Loader */}
        <div className="flex justify-center gap-2 mt-4">
          <span className="w-3 h-3 bg-white rounded-full animate-bounce"></span>
          <span className="w-3 h-3 bg-white rounded-full animate-bounce delay-150"></span>
          <span className="w-3 h-3 bg-white rounded-full animate-bounce delay-300"></span>
        </div>

        <p className="text-sm text-gray-300">Loading experience...</p>
      </div>
    </div>
  );
}