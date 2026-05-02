export function generatePlayers() {
  return [
    { id: 1, x: 20, y: 30 },
    { id: 2, x: 40, y: 50 },
    { id: 3, x: 60, y: 70 },
  ];
}

export function movePlayers(players) {
  return players.map((p) => ({
    ...p,
    x: Math.min(95, Math.max(5, p.x + (Math.random() * 6 - 3))),
    y: Math.min(95, Math.max(5, p.y + (Math.random() * 6 - 3))),
  }));
}

// 🧠 BALL MOVEMENT BASED ON SPIN
export function moveBall(ball, spin) {
  return {
    x: Math.min(95, Math.max(5, ball.x + spin * 0.002)),
    y: Math.min(95, Math.max(5, ball.y + (Math.random() * 4 - 2))),
  };
}