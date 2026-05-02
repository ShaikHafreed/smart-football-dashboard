import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 🔥 HANDLE LOGIN
  const handleLogin = (e) => {
    e.preventDefault();

    // 👉 SIMPLE VALIDATION
    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }

    // 🔥 SAVE USER (TEMP LOCAL STORAGE)
    localStorage.setItem("user", JSON.stringify({ email }));

    // 🚀 REDIRECT TO HOME (DASHBOARD)
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900">

      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md animate-fadeIn">

        <h1 className="text-2xl font-bold mb-6 text-center">
          🔐 Login to Smart Football
        </h1>

        <form onSubmit={handleLogin} className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 border rounded-lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 border rounded-lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Login
          </button>
        </form>

        {/* EXTRA OPTIONS */}
        <div className="mt-6 space-y-3">

          <button className="w-full bg-red-500 text-white py-2 rounded-lg">
            Continue with Google
          </button>

          <button className="w-full bg-blue-700 text-white py-2 rounded-lg">
            Continue with Facebook
          </button>

          <button className="w-full bg-gray-800 text-white py-2 rounded-lg">
            Continue with Mobile Number
          </button>

        </div>
      </div>
    </div>
  );
}