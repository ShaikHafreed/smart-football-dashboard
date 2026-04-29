/**
 * WebSocket Service — Smart Football Analytics
 * Abstracts all WebSocket logic for easy migration to any React environment.
 * Configure endpoint via: VITE_WS_URL env variable.
 * Falls back to mock data if WebSocket is unavailable.
 */

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:5000";

/** Generate plausible mock sensor readings */
function generateMockData() {
  return {
    kickForce: Math.floor(180 + Math.random() * 380),
    ballSpeed: Math.floor(38 + Math.random() * 72),
    spinRate: Math.floor(550 + Math.random() * 1300),
    timestamp: Date.now(),
  };
}

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.status = "disconnected"; // disconnected | connecting | connected | error
    this.mockInterval = null;
    this.reconnectTimer = null;
    this.shouldReconnect = false;
    this.reconnectDelay = 2000;
  }

  /** Subscribe to sensor data events */
  onData(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Subscribe to connection status changes */
  onStatus(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  _setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  _emit(data) {
    this.listeners.forEach((cb) => cb(data));
  }

  /** Start mock data streaming (fallback when WebSocket unavailable) */
  _startMock() {
    this._setStatus("mock");
    this.mockInterval = setInterval(() => {
      this._emit(generateMockData());
    }, 1200);
  }

  _stopMock() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  /** Connect to WebSocket. Falls back to mock after timeout. */
  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this._stopMock();
    this._setStatus("connecting");
    this.shouldReconnect = true;

    // Attempt real WebSocket
    const connectTimeout = setTimeout(() => {
      if (this.status === "connecting") {
        console.warn("[WS] Connection timed out — switching to mock data");
        this.ws?.close();
        this._startMock();
      }
    }, 3000);

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        clearTimeout(connectTimeout);
        this._setStatus("connected");
        this.reconnectDelay = 2000;
        console.log("[WS] Connected to", WS_URL);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._emit({
            kickForce: data.kick_force ?? data.kickForce,
            ballSpeed: data.ball_speed ?? data.ballSpeed,
            spinRate: data.spin_rate ?? data.spinRate,
            timestamp: data.timestamp ?? Date.now(),
          });
        } catch (e) {
          console.warn("[WS] Failed to parse message", e);
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connectTimeout);
        console.warn("[WS] Connection error — switching to mock data");
        this._startMock();
      };

      this.ws.onclose = () => {
        clearTimeout(connectTimeout);
        if (this.status === "connected") {
          this._setStatus("disconnected");
          if (this.shouldReconnect) {
            this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000);
          }
        }
      };
    } catch {
      clearTimeout(connectTimeout);
      this._startMock();
    }
  }

  /** Disconnect and stop all data streaming */
  disconnect() {
    this.shouldReconnect = false;
    this._stopMock();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._setStatus("disconnected");
  }
}

// Singleton export
export const wsService = new WebSocketService();