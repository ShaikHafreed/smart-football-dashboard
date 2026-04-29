/**
 * Mock data generators — Smart Football Analytics
 * Used for development, demos, and WebSocket fallback.
 */

export const MOCK_PLAYERS = [
  { id: "m1", name: "Ali Hassan",    role: "player", age: 19, kick_force: 420, ball_speed: 88, spin_rate: 1380 },
  { id: "m2", name: "Omar Khalid",   role: "player", age: 22, kick_force: 360, ball_speed: 75, spin_rate: 1150 },
  { id: "m3", name: "Yusuf Ahmed",   role: "player", age: 17, kick_force: 290, ball_speed: 63, spin_rate: 940  },
  { id: "m4", name: "Karim El-Din",  role: "player", age: 24, kick_force: 480, ball_speed: 95, spin_rate: 1550 },
  { id: "m5", name: "Tariq Mahmoud", role: "player", age: 20, kick_force: 340, ball_speed: 72, spin_rate: 1080 },
];

export const MOCK_SESSIONS = [
  { kick_force: 380, ball_speed: 85, spin_rate: 1350, session_date: new Date(Date.now() - 86400000).toISOString(),  duration_minutes: 45 },
  { kick_force: 290, ball_speed: 72, spin_rate: 1100, session_date: new Date(Date.now() - 172800000).toISOString(), duration_minutes: 30 },
  { kick_force: 450, ball_speed: 92, spin_rate: 1500, session_date: new Date(Date.now() - 259200000).toISOString(), duration_minutes: 60 },
];