import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    dob: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = () => {
    if (!form.name || !form.email) {
      alert("Fill all fields");
      return;
    }

    localStorage.setItem("fb_user", JSON.stringify(form));
    navigate("/dashboard");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-300">

      <div className="bg-white p-8 rounded-2xl shadow-xl w-96 space-y-5 animate-fadeIn">

        <h2 className="text-2xl font-bold text-center">
          Welcome 👋
        </h2>

        <p className="text-center text-sm text-gray-500">
          Login to continue
        </p>

        <input
          name="name"
          placeholder="Full Name"
          onChange={handleChange}
          className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <input
          name="email"
          placeholder="Email"
          onChange={handleChange}
          className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          onChange={handleChange}
          className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-400 outline-none"
        />

        <input
          name="dob"
          type="date"
          onChange={handleChange}
          className="border p-2 w-full rounded"
        />

        <button
          onClick={handleLogin}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Continue →
        </button>

        {/* Divider */}
        <div className="text-center text-sm text-gray-400">OR</div>

        {/* Social buttons */}
        <button className="w-full border py-2 rounded-lg hover:bg-gray-100 transition">
          Continue with Google
        </button>

        <button className="w-full border py-2 rounded-lg hover:bg-gray-100 transition">
          Continue with Facebook
        </button>

      </div>
    </div>
  );
}