import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function DOBInput() {
  const [dob, setDob] = useState("");
  const navigate = useNavigate();

  const handleNext = () => {
    if (!dob) return;
    localStorage.setItem("dob", dob);
    navigate("/login");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-purple-200">

      <div className="bg-white/70 backdrop-blur-lg p-8 rounded-2xl shadow-xl w-96 space-y-6 animate-fadeIn">

        <h1 className="text-2xl font-bold text-center">
          🎂 Your DOB
        </h1>

        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-purple-400 transition"
        />

        <button
          onClick={handleNext}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl shadow transition hover:scale-[1.02]"
        >
          Continue →
        </button>

        <p className="text-xs text-center text-gray-500">
          Used for analytics insights
        </p>
      </div>
    </div>
  );
}