import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Trash2, CheckCircle2, BarChart3 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import PlayerDetailModal from "../components/players/PlayerDetailModal";

export default function Players() {
  const { user, role } = useAuth();
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [activePlayerId, setActivePlayerId] = useState(
    localStorage.getItem("activePlayerId") || null
  );
  const [loading, setLoading] = useState(true);
  const [detailPlayer, setDetailPlayer] = useState(null);

  const loadPlayers = async () => {
    const { data } = await supabase
      .from("football_players")
      .select("*")
      .order("created_at", { ascending: true });

    setPlayers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadPlayers();
  }, [user]);

  // Roster management is a coach feature — players use "My Performance" instead.
  if (role === "player") {
    return <Navigate to="/analytics" replace />;
  }

  const addPlayer = async () => {
    if (!name.trim() || !user) return;

    const { error } = await supabase
      .from("football_players")
      .insert({ name, user_id: user.id });

    if (!error) {
      setName("");
      loadPlayers();
    }
  };

  const deletePlayer = async (id) => {
    await supabase.from("football_players").delete().eq("id", id);

    if (activePlayerId === id) {
      setActivePlayerId(null);
      localStorage.removeItem("activePlayerId");
    }

    loadPlayers();
  };

  const selectActive = (id) => {
    setActivePlayerId(id);
    localStorage.setItem("activePlayerId", id);
  };

  return (
    <div className="space-y-6 animate-fadeIn">

      <div>
        <h1 className="font-display text-2xl font-semibold">Players</h1>
        <p className="text-sm text-muted-foreground">Pick an active player before starting a Session, or view their full data.</p>
      </div>

      {/* ADD PLAYER */}
      <div className="flex gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          placeholder="Enter player name..."
          className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
        />

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={addPlayer}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <UserPlus className="h-4 w-4" /> Add
        </motion.button>
      </div>

      {/* PLAYER LIST */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {loading && <p className="text-muted-foreground">Loading…</p>}

        {!loading && players.length === 0 && (
          <p className="text-muted-foreground">No players added yet.</p>
        )}

        <AnimatePresence>
          {players.map((player) => {
            const isActive = activePlayerId === player.id;
            return (
              <motion.div
                key={player.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`rounded-xl border p-4 transition-colors
                  ${isActive
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"}`}
              >
                <div className="flex items-center justify-between">
                  <button className="text-left font-medium" onClick={() => selectActive(player.id)}>
                    {player.name}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetailPlayer(player)}
                      className="text-muted-foreground hover:text-primary"
                      aria-label={`View ${player.name}'s data`}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deletePlayer(player.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${player.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <button onClick={() => selectActive(player.id)} className="mt-2 block text-left">
                  {isActive ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active for next Session
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Tap to set as active</p>
                  )}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <PlayerDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
    </div>
  );
}
