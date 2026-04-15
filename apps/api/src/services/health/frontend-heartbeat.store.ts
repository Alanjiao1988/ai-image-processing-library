let lastFrontendPingAt: Date | null = null;

export function registerFrontendHeartbeat() {
  lastFrontendPingAt = new Date();
}

export function getFrontendHeartbeatTimestamp() {
  return lastFrontendPingAt;
}
