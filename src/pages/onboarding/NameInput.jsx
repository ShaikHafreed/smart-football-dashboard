import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function NameInput() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleNext = () => {
    if (!name) return alert("Enter your name");
    localStorage.setItem("user_name", name);
    navigate("/onboarding/dob");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-8 rounded-xl shadow-lg w-[350px] text-center">

        <h2 className="text-xl font-semibold mb-2">Step 1 of 2</h2>
        <p className="text-gray-500 mb-4">What’s your name?</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="w-full border p-3 rounded mb-5"
        />

        <button
          onClick={handleNext}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Continue →
        </button>

      </div>

    </div>
  );
}