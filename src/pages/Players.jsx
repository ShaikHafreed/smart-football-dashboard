import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    kick: "",
    speed: "",
    spin: "",
  });

  const [editIndex, setEditIndex] = useState(null);

  const navigate = useNavigate(); // ✅ CORRECT PLACE

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("fb_players")) || [];
    setPlayers(stored);
  }, []);

  const savePlayers = (data) => {
    localStorage.setItem("fb_players", JSON.stringify(data));
    setPlayers(data);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ADD OR UPDATE
  const handleSubmit = () => {
    if (!form.name) return;

    const newPlayer = {
      name: form.name,
      kick: Number(form.kick),
      speed: Number(form.speed),
      spin: Number(form.spin),
    };

    let updated;

    if (editIndex !== null) {
      updated = [...players];
      updated[editIndex] = newPlayer;
    } else {
      updated = [...players, newPlayer];
    }

    savePlayers(updated);

    // Reset form
    setForm({
      name: "",
      kick: "",
      speed: "",
      spin: "",
    });

    setEditIndex(null);
  };

  // DELETE
  const deletePlayer = (index) => {
    const updated = players.filter((_, i) => i !== index);
    savePlayers(updated);
  };

  // EDIT
  const editPlayer = (index) => {
    const p = players[index];
    setForm(p);
    setEditIndex(index);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold dark:text-white">Players</h1>

      {/* FORM */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow space-y-3">
        <h2 className="font-semibold dark:text-white">
          {editIndex !== null ? "Edit Player" : "Add Player"}
        </h2>

        <input
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          className="border p-2 w-full rounded dark:bg-slate-700 dark:text-white"
        />

        <input
          name="kick"
          placeholder="Kick Force"
          value={form.kick}
          onChange={handleChange}
          className="border p-2 w-full rounded dark:bg-slate-700 dark:text-white"
        />

        <input
          name="speed"
          placeholder="Ball Speed"
          value={form.speed}
          onChange={handleChange}
          className="border p-2 w-full rounded dark:bg-slate-700 dark:text-white"
        />

        <input
          name="spin"
          placeholder="Spin Rate"
          value={form.spin}
          onChange={handleChange}
          className="border p-2 w-full rounded dark:bg-slate-700 dark:text-white"
        />

        <button
          onClick={handleSubmit}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {editIndex !== null ? "Update Player" : "Add Player"}
        </button>
      </div>

      {/* PLAYER CARDS */}
      <div className="grid md:grid-cols-3 gap-4">
        {players.length === 0 ? (
          <p className="dark:text-white">No players yet 👆</p>
        ) : (
          players.map((p, i) => (
            <div
              key={i}
              onClick={() => navigate(`/player/${p.name}`)} // ✅ CLICK TO ANALYTICS
              className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow hover:shadow-lg hover:scale-105 transition cursor-pointer"
            >
              <h3 className="text-lg font-bold dark:text-white">{p.name}</h3>

              <div className="mt-2 text-sm space-y-1 dark:text-gray-300">
                <p>⚡ Kick: {p.kick} N</p>
                <p>🏃 Speed: {p.speed} km/h</p>
                <p>🌀 Spin: {p.spin} RPM</p>
              </div>

              {/* STOP CLICK PROPAGATION FOR BUTTONS */}
              <div
                className="flex gap-2 mt-4"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => editPlayer(i)}
                  className="px-3 py-1 text-sm bg-yellow-500 text-white rounded"
                >
                  Edit
                </button>

                <button
                  onClick={() => deletePlayer(i)}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}