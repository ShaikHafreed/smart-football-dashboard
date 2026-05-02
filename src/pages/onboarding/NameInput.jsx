import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function NameInput() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleNext = () => {
    if (!name.trim()) return;
    localStorage.setItem("name", name);
    navigate("/onboarding/dob");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200">

      <div className="bg-white/70 backdrop-blur-lg p-8 rounded-2xl shadow-xl w-96 space-y-6 animate-fadeIn">

        <h1 className="text-2xl font-bold text-center">
          👤 Your Name
        </h1>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-400 transition"
        />

        <button
          onClick={handleNext}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl shadow transition hover:scale-[1.02]"
        >
          Continue →
        </button>

        <p className="text-xs text-center text-gray-500">
          This helps personalize your experience
        </p>
      </div>
    </div>
  );
}