import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-800">

      <div className="bg-white p-10 rounded-2xl shadow-xl w-[360px] text-center">

        <h1 className="text-3xl font-bold mb-2">⚽ Smart Football</h1>
        <p className="text-gray-500 mb-6">Track your performance like a pro</p>

        <button
          onClick={() => navigate("/onboarding/name")}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:scale-105 transition"
        >
          Get Started
        </button>

      </div>

    </div>
  );
}