const REST_BASE = import.meta.env.VITE_LOBBY_HTTP || 'http://localhost:2567';

// Derive WS URL from REST base
function wsBase() {
  const url = new URL(REST_BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.origin;
}

class SocialService {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;
    this.address = null;
    this._heartbeatId = null;
    this._reconnectDelay = 1000;
    this._reconnectId = null;
    this._intentionalClose = false;

    // Callbacks — set by WaitingRoomScene
    this.onFriendRequest = null;
    this.onFriendAccepted = null;
    this.onFriendOnline = null;
    this.onFriendOffline = null;
    this.onSquadInvite = null;
    this.onSquadUpdate = null;
    this.onSquadDisbanded = null;
    this.onGameReady = null;
    this.onGameReadyError = null;
    this.onMatchmakingStatus = null;
  }

  // --- WebSocket lifecycle ---

  connect(address) {
    if (!address) return;
    this.address = address.toLowerCase();
    this._intentionalClose = false;
    this._openSocket();
  }

  disconnect() {
    this._intentionalClose = true;
    this._stopHeartbeat();
    if (this._reconnectId) {
      clearTimeout(this._reconnectId);
      this._reconnectId = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
  }

  get connected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  _openSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }

    const url = `${wsBase()}/ws/social?address=${this.address}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[Social] WS connected');
      this._reconnectDelay = 1000;
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => this._onMessage(event);

    this.ws.onclose = () => {
      this._stopHeartbeat();
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  _stopHeartbeat() {
    if (this._heartbeatId) {
      clearInterval(this._heartbeatId);
      this._heartbeatId = null;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectId) return;
    console.log(`[Social] reconnecting in ${this._reconnectDelay}ms`);
    this._reconnectId = setTimeout(() => {
      this._reconnectId = null;
      this._openSocket();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
  }

  _onMessage(event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }

    const type = msg.type;
    switch (type) {
      case 'pong': break;
      case 'friend_request':
        if (this.onFriendRequest) this.onFriendRequest(msg);
        break;
      case 'friend_accepted':
        if (this.onFriendAccepted) this.onFriendAccepted(msg);
        break;
      case 'friend_online':
        if (this.onFriendOnline) this.onFriendOnline(msg);
        break;
      case 'friend_offline':
        if (this.onFriendOffline) this.onFriendOffline(msg);
        break;
      case 'squad_invite':
        if (this.onSquadInvite) this.onSquadInvite(msg);
        break;
      case 'squad_update':
        if (this.onSquadUpdate) this.onSquadUpdate(msg);
        break;
      case 'squad_disbanded':
        if (this.onSquadDisbanded) this.onSquadDisbanded(msg);
        break;
      case 'game_ready':
        if (this.onGameReady) this.onGameReady(msg);
        break;
      case 'game_ready_error':
        if (this.onGameReadyError) this.onGameReadyError(msg);
        break;
      case 'matchmaking_status':
        if (this.onMatchmakingStatus) this.onMatchmakingStatus(msg);
        break;
      default:
        console.debug('[Social] unknown message type:', type, msg);
    }
  }

  // --- REST wrappers ---

  async _fetch(path, options = {}) {
    const res = await fetch(`${REST_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Profile
  getProfile(address) {
    return this._fetch(`/api/profile/${address.toLowerCase()}`);
  }

  updateProfile(address, { displayName, baseName } = {}) {
    return this._fetch(`/api/profile/${address.toLowerCase()}`, {
      method: 'PUT',
      body: JSON.stringify({ displayName, baseName }),
    });
  }

  // Friends
  getFriends(address) {
    return this._fetch(`/api/friends/${address.toLowerCase()}`);
  }

  getFriendRequests(address) {
    return this._fetch(`/api/friends/${address.toLowerCase()}/requests`);
  }

  sendFriendRequest(from, to) {
    return this._fetch('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ from: from.toLowerCase(), to: to.toLowerCase() }),
    });
  }

  acceptFriendRequest(from, to) {
    return this._fetch('/api/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ from: from.toLowerCase(), to: to.toLowerCase() }),
    });
  }

  rejectFriendRequest(from, to) {
    return this._fetch('/api/friends/reject', {
      method: 'POST',
      body: JSON.stringify({ from: from.toLowerCase(), to: to.toLowerCase() }),
    });
  }

  removeFriend(owner, friend) {
    return this._fetch(`/api/friends/${owner.toLowerCase()}/${friend.toLowerCase()}`, {
      method: 'DELETE',
    });
  }

  // Squad
  createSquad(leader) {
    return this._fetch('/api/squad/create', {
      method: 'POST',
      body: JSON.stringify({ leader: leader.toLowerCase() }),
    });
  }

  joinSquad(squadId, address) {
    return this._fetch('/api/squad/join', {
      method: 'POST',
      body: JSON.stringify({ squadId, address: address.toLowerCase() }),
    });
  }

  leaveSquad(squadId, address) {
    return this._fetch('/api/squad/leave', {
      method: 'POST',
      body: JSON.stringify({ squadId, address: address.toLowerCase() }),
    });
  }

  setReady(squadId, address, ready) {
    return this._fetch('/api/squad/ready', {
      method: 'POST',
      body: JSON.stringify({ squadId, address: address.toLowerCase(), ready }),
    });
  }

  inviteToSquad(squadId, from, to) {
    return this._fetch('/api/squad/invite', {
      method: 'POST',
      body: JSON.stringify({ squadId, from: from.toLowerCase(), to: to.toLowerCase() }),
    });
  }

  getMySquad(address) {
    return this._fetch(`/api/squad/mine/${address.toLowerCase()}`);
  }

  // Match
  startMatch(squadId, leader, missionId = null, difficulty = null) {
    const body = { squadId, leader: leader.toLowerCase() };
    // Prefer difficulty-based procedural generation
    if (difficulty) {
      body.difficulty = difficulty;
    } else if (missionId) {
      body.missionId = missionId;
    }
    return this._fetch('/api/match/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  startMatchmaking(address) {
    return this._fetch('/api/match/matchmaking', {
      method: 'POST',
      body: JSON.stringify({ address: address.toLowerCase() }),
    });
  }

  stopMatchmaking(address) {
    return this._fetch(`/api/match/matchmaking/${address.toLowerCase()}`, {
      method: 'DELETE',
    });
  }

  // Online players (discovery)
  getOnlinePlayers() {
    return this._fetch('/api/online');
  }
}

export const socialService = new SocialService();
