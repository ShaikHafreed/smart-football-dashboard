import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const navigate = useNavigate();

  const storedUser = JSON.parse(localStorage.getItem("fb_user"));
  const [user, setUser] = useState(storedUser || {});
  const [editMode, setEditMode] = useState(false);

  const calculateAge = (dob) => {
    if (!dob) return "-";
    const birth = new Date(dob);
    const diff = Date.now() - birth.getTime();
    return new Date(diff).getUTCFullYear() - 1970;
  };

  const handleChange = (e) => {
    setUser({ ...user, [e.target.name]: e.target.value });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setUser({ ...user, avatar: reader.result });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    localStorage.setItem("fb_user", JSON.stringify(user));
    setEditMode(false);
    alert("Profile updated ✅");
  };

  /* 🔥 FIXED LOGOUT */
  const handleLogout = () => {
    localStorage.clear();
    navigate("/", { replace: true });
  };

  if (!user) return <p className="p-6">No user data</p>;

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">

      <h1 className="text-3xl font-bold">Profile 👤</h1>

      {/* Avatar */}
      <div className="flex flex-col items-center space-y-3">
        <img
          src={user.avatar || "https://via.placeholder.com/100"}
          alt="avatar"
          className="w-24 h-24 rounded-full object-cover border"
        />

        {editMode && (
          <input type="file" accept="image/*" onChange={handleImageUpload} />
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-white p-6 rounded-xl shadow space-y-4">

        {/* Name */}
        <div>
          <p className="text-sm text-gray-500">Name</p>
          {editMode ? (
            <input
              name="name"
              value={user.name || ""}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />
          ) : (
            <p className="font-semibold">{user.name}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <p className="text-sm text-gray-500">Email</p>
          {editMode ? (
            <input
              name="email"
              value={user.email || ""}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />
          ) : (
            <p className="font-semibold">{user.email || "Not added"}</p>
          )}
        </div>

        {/* DOB */}
        <div>
          <p className="text-sm text-gray-500">Date of Birth</p>
          {editMode ? (
            <input
              type="date"
              name="dob"
              value={user.dob || ""}
              onChange={handleChange}
              className="border p-2 w-full rounded"
            />
          ) : (
            <p className="font-semibold">{user.dob}</p>
          )}
        </div>

        {/* Age */}
        <div>
          <p className="text-sm text-gray-500">Age</p>
          <p className="font-semibold">{calculateAge(user.dob)} years</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-4">

          {editMode ? (
            <>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                Save
              </button>

              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 bg-gray-400 text-white rounded"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Edit Profile
            </button>
          )}

        </div>

      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
      >
        Logout 🚪
      </button>

    </div>
  );
}