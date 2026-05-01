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
app.post("/data", (req, res) => {
  latestData = req.body;
  console.log("📡 Data received:", latestData);
  res.send("OK");
});

// React fetches data here
app.get("/data", (req, res) => {
  res.json(latestData);
});

app.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://0.0.0.0:5000");
});