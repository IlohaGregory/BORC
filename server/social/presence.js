import { updateLastSeen, getFriends, getPlayer } from '../db.js';

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

class Presence {
  constructor() {
    /** @type {Map<string, import('ws').WebSocket>} */
    this.sockets = new Map();
    this._heartbeatInterval = null;
  }

  start() {
    this._heartbeatInterval = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL);
  }

  stop() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  /** Register a connected socket */
  add(address, ws) {
    const existing = this.sockets.get(address);
    if (existing && existing !== ws) {
      try { existing.close(); } catch (_) {}
    }
    this.sockets.set(address, ws);
    ws._address = address;
    ws._alive = true;

    const now = Date.now();
    updateLastSeen.run(now, address);

    // Notify friends this player is online
    const player = getPlayer.get(address);
    const displayName = player?.display_name || 'Someone';
    const friends = getFriends.all(address);
    const friendAddresses = friends.map(f => f.address);
    this.broadcast(friendAddresses, 'friend_online', { address, displayName });
  }

  /** Remove a disconnected socket */
  remove(address) {
    this.sockets.delete(address);
    const now = Date.now();
    try { updateLastSeen.run(now, address); } catch (_) {}

    // Notify friends this player is offline
    const friends = getFriends.all(address);
    const friendAddresses = friends.map(f => f.address);
    this.broadcast(friendAddresses, 'friend_offline', { address });
  }

  /** Check if address is online */
  isOnline(address) {
    const ws = this.sockets.get(address);
    return !!(ws && ws.readyState === 1); // WebSocket.OPEN
  }

  /** Get all online addresses */
  getOnlineAddresses() {
    const result = [];
    for (const [addr, ws] of this.sockets) {
      if (ws.readyState === 1) result.push(addr);
    }
    return result;
  }

  /** Send message to one client */
  send(address, type, payload) {
    const ws = this.sockets.get(address);
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type, ...payload }));
      } catch (_) {}
    }
  }

  /** Send message to multiple clients */
  broadcast(addresses, type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    for (const addr of addresses) {
      const ws = this.sockets.get(addr);
      if (ws && ws.readyState === 1) {
        try { ws.send(msg); } catch (_) {}
      }
    }
  }

  /** Ping all clients, close those that didn't respond */
  _heartbeat() {
    for (const [addr, ws] of this.sockets) {
      if (ws._alive === false) {
        // Didn't respond to last ping — terminate
        this.remove(addr);
        try { ws.terminate(); } catch (_) {}
        continue;
      }
      ws._alive = false;
      try { ws.ping(); } catch (_) {}
    }
  }
}

export const presence = new Presence();
