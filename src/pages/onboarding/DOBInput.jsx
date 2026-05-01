import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function DOBInput() {
  const [dob, setDob] = useState("");
  const navigate = useNavigate();

  const handleNext = () => {
    if (!dob) return alert("Select your DOB");

    const name = localStorage.getItem("user_name");

    const user = {
      name,
      dob,
    };

    localStorage.setItem("fb_user", JSON.stringify(user));

    navigate("/dashboard");
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-8 rounded-xl shadow-lg w-[350px] text-center">

        <h2 className="text-xl font-semibold mb-2">Step 2 of 2</h2>
        <p className="text-gray-500 mb-4">Your date of birth</p>

        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full border p-3 rounded mb-5"
        />

        <button
          onClick={handleNext}
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
        >
          Finish 🎉
        </button>

      </div>

    </div>
  );
}