// Base URL for the Flask hardware relay. Defaults to localhost for plain
// local dev; set VITE_FLASK_URL once the relay is deployed publicly (see
// backend/render.yaml) so the ESP32 and this site can both reach it from
// any Wi-Fi network, not just the one the relay's machine is on.
export const FLASK_URL = import.meta.env.VITE_FLASK_URL || "http://127.0.0.1:5000";
