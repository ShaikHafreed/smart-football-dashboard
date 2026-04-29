const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let latestData = {
  kick: 0,
  speed: 0,
  spin: 0,
};

// ESP32 sends data here
app.post("/sensor", (req, res) => {
  latestData = req.body;
  console.log("📡 Data received:", latestData);
  res.json({ status: "ok" });
});

// React fetches data from here
app.get("/sensor", (req, res) => {
  res.json(latestData);
});

app.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
});