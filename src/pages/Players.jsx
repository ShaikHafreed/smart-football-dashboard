import { useEffect, useState } from "react";

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [activePlayer, setActivePlayer] = useState(null);

  // 🔥 LOAD FROM LOCAL STORAGE
  useEffect(() => {
    const savedPlayers = JSON.parse(localStorage.getItem("players")) || [];
    const savedActive = JSON.parse(localStorage.getItem("activePlayer"));

    setPlayers(savedPlayers);
    setActivePlayer(savedActive);
  }, []);

  // 🔥 SAVE TO LOCAL STORAGE
  useEffect(() => {
    localStorage.setItem("players", JSON.stringify(players));
    localStorage.setItem("activePlayer", JSON.stringify(activePlayer));
  }, [players, activePlayer]);

  // ➕ ADD PLAYER
  const addPlayer = () => {
    if (!name.trim()) return;

    const newPlayer = {
      id: Date.now(),
      name,
    };

    setPlayers([...players, newPlayer]);
    setName("");
  };

  // ❌ DELETE PLAYER
  const deletePlayer = (id) => {
    const updated = players.filter((p) => p.id !== id);
    setPlayers(updated);

    if (activePlayer?.id === id) {
      setActivePlayer(null);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">

      {/* HEADER */}
      <h1 className="text-3xl font-bold">👤 Players</h1>

      {/* ADD PLAYER */}
      <div className="flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter player name..."
          className="flex-1 px-4 py-2 border rounded-lg outline-none"
        />

        <button
          onClick={addPlayer}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg shadow"
        >
          ➕ Add
        </button>
      </div>

      {/* PLAYER LIST */}
      <div className="grid md:grid-cols-3 gap-4">

        {players.length === 0 && (
          <p className="text-gray-500">No players added yet.</p>
        )}

        {players.map((player) => (
          <div
            key={player.id}
            className={`p-4 rounded-xl shadow cursor-pointer border transition
              ${
                activePlayer?.id === player.id
                  ? "bg-blue-100 border-blue-500"
                  : "bg-white hover:shadow-lg"
              }`}
            onClick={() => setActivePlayer(player)}
          >
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">
                {player.name}
              </h2>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePlayer(player.id);
                }}
                className="text-red-500 hover:text-red-700"
              >
                ❌
              </button>
            </div>

            {activePlayer?.id === player.id && (
              <p className="text-sm text-blue-600 mt-2">
                Active Player
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}