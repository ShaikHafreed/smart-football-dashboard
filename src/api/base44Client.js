// src/api/base44Client.js

// ✅ Safe localStorage helpers
const getData = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};

const setData = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// ✅ Generate unique ID
const generateId = () => Date.now() + Math.floor(Math.random() * 1000);

// ✅ Advanced filter (supports partial match)
const applyFilter = (data, query = {}) => {
  return data.filter((item) =>
    Object.entries(query).every(([key, value]) => {
      if (!value) return true;
      return String(item[key])
        .toLowerCase()
        .includes(String(value).toLowerCase());
    })
  );
};

// ✅ Sort helper
const sortData = (data, key = "created_date") => {
  return [...data].sort((a, b) => new Date(b[key]) - new Date(a[key]));
};

// ✅ Event system (for future real-time UI)
const listeners = {};

const emit = (event, payload) => {
  if (listeners[event]) {
    listeners[event].forEach((cb) => cb(payload));
  }
};

const subscribe = (event, cb) => {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);

  return () => {
    listeners[event] = listeners[event].filter((fn) => fn !== cb);
  };
};

// ✅ Mock base44 replacement
export const base44 = {
  // 🔹 Generic GET
  get: async (url) => {
    console.log("GET:", url);
    return { data: [], status: 200 };
  },

  // 🔹 Generic POST
  post: async (url, body) => {
    console.log("POST:", url, body);
    return { data: { success: true }, status: 200 };
  },

  // 🔥 Entities
  entities: {
    // 👤 PLAYER PROFILE
    PlayerProfile: {
      list: async () => {
        return getData("fb_players");
      },

      filter: async (query = {}) => {
        const data = getData("fb_players");
        return applyFilter(data, query);
      },

      create: async (data) => {
        const players = getData("fb_players");

        const newPlayer = {
          id: generateId(),
          created_date: new Date().toISOString(),
          ...data,
        };

        const updated = [...players, newPlayer];
        setData("fb_players", updated);

        emit("players:update", updated);

        return newPlayer;
      },

      update: async (id, updates) => {
        const players = getData("fb_players");

        const updated = players.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        );

        setData("fb_players", updated);
        emit("players:update", updated);

        return updated.find((p) => p.id === id);
      },

      delete: async (id) => {
        const players = getData("fb_players");
        const updated = players.filter((p) => p.id !== id);

        setData("fb_players", updated);
        emit("players:update", updated);

        return true;
      },
    },

    // ⚽ TRAINING SESSION
    TrainingSession: {
      list: async (sort = true, limit = null) => {
        let data = getData("fb_sessions");

        if (sort) data = sortData(data);

        if (limit) data = data.slice(0, limit);

        return data;
      },

      create: async (data) => {
        const sessions = getData("fb_sessions");

        const newSession = {
          id: generateId(),
          created_date: new Date().toISOString(),
          ...data,
        };

        const updated = [...sessions, newSession];
        setData("fb_sessions", updated);

        emit("sessions:update", updated);

        return newSession;
      },

      delete: async (id) => {
        const sessions = getData("fb_sessions");
        const updated = sessions.filter((s) => s.id !== id);

        setData("fb_sessions", updated);
        emit("sessions:update", updated);

        return true;
      },
    },
  },

  // 🔐 Auth mock
  auth: {
    me: async () => {
      const name = localStorage.getItem("fb_name");
      const role = localStorage.getItem("fb_role");
      const age = localStorage.getItem("fb_age");

      if (!name) return null;

      return { name, role, age };
    },

    login: async (name, role = "player") => {
      localStorage.setItem("fb_name", name);
      localStorage.setItem("fb_role", role);

      return { name, role };
    },

    logout: async () => {
      localStorage.clear();
      window.location.href = "/";
    },
  },

  // 🔥 Real-time subscription (future dashboard)
  subscribe,
};