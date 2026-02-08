import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'borc-data.json');

// --- In-memory data with JSON file persistence ---
let data = {
  players: {},    // address -> player record
  friends: [],    // { player_address, friend_address, status, created_at }
  matchHistory: [] // { id, room_id, player_address, score, wave, played_at }
};

// Load existing data
function loadData() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      data = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[DB] Failed to load data, starting fresh:', e.message);
  }
}

function saveData() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[DB] Failed to save data:', e.message);
  }
}

// Initialize
loadData();

// --- Players ---

const upsertPlayer = {
  run(address, display_name, base_name, last_seen) {
    const existing = data.players[address] || {};
    data.players[address] = {
      address,
      display_name: display_name || existing.display_name || 'Guest',
      base_name: base_name ?? existing.base_name ?? null,
      last_seen: last_seen || Date.now(),
      created_at: existing.created_at || Date.now(),
      token_balance: existing.token_balance || 0,
      total_score: existing.total_score || 0,
      games_played: existing.games_played || 0,
      highest_wave: existing.highest_wave || 0,
    };
    saveData();
  }
};

const getPlayer = {
  get(address) {
    return data.players[address] || null;
  }
};

const updateLastSeen = {
  run(last_seen, address) {
    if (data.players[address]) {
      data.players[address].last_seen = last_seen;
      saveData();
    }
  }
};

const updateStats = {
  run(score, wave, address) {
    const p = data.players[address];
    if (p) {
      p.total_score = (p.total_score || 0) + score;
      p.games_played = (p.games_played || 0) + 1;
      p.highest_wave = Math.max(p.highest_wave || 0, wave);
      saveData();
    }
  }
};

// --- Friends ---

const insertFriendRequest = {
  run(player_address, friend_address) {
    const exists = data.friends.find(f =>
      f.player_address === player_address && f.friend_address === friend_address
    );
    if (!exists) {
      data.friends.push({
        player_address,
        friend_address,
        status: 'pending',
        created_at: Date.now()
      });
      saveData();
    }
  }
};

const acceptFriend = {
  run(player_address, friend_address) {
    const f = data.friends.find(f =>
      f.player_address === player_address &&
      f.friend_address === friend_address &&
      f.status === 'pending'
    );
    if (f) {
      f.status = 'accepted';
      saveData();
    }
  }
};

const insertReverseFriend = {
  run(player_address, friend_address) {
    const exists = data.friends.find(f =>
      f.player_address === player_address && f.friend_address === friend_address
    );
    if (!exists) {
      data.friends.push({
        player_address,
        friend_address,
        status: 'accepted',
        created_at: Date.now()
      });
      saveData();
    }
  }
};

const acceptFriendTx = (from, to) => {
  acceptFriend.run(from, to);
  insertReverseFriend.run(to, from);
};

const rejectFriend = {
  run(player_address, friend_address) {
    data.friends = data.friends.filter(f =>
      !(f.player_address === player_address &&
        f.friend_address === friend_address &&
        f.status === 'pending')
    );
    saveData();
  }
};

const removeFriend = {
  run(owner, friend, friend2, owner2) {
    data.friends = data.friends.filter(f =>
      !((f.player_address === owner && f.friend_address === friend) ||
        (f.player_address === friend2 && f.friend_address === owner2))
    );
    saveData();
  }
};

const getFriends = {
  all(player_address) {
    return data.friends
      .filter(f => f.player_address === player_address && f.status === 'accepted')
      .map(f => {
        const p = data.players[f.friend_address] || {};
        return {
          address: f.friend_address,
          display_name: p.display_name || 'Guest',
          base_name: p.base_name || null,
          last_seen: p.last_seen || 0,
        };
      });
  }
};

const getIncomingRequests = {
  all(friend_address) {
    return data.friends
      .filter(f => f.friend_address === friend_address && f.status === 'pending')
      .map(f => {
        const p = data.players[f.player_address] || {};
        return {
          address: f.player_address,
          display_name: p.display_name || 'Guest',
          base_name: p.base_name || null,
        };
      });
  }
};

const getOutgoingRequests = {
  all(player_address) {
    return data.friends
      .filter(f => f.player_address === player_address && f.status === 'pending')
      .map(f => {
        const p = data.players[f.friend_address] || {};
        return {
          address: f.friend_address,
          display_name: p.display_name || 'Guest',
          base_name: p.base_name || null,
        };
      });
  }
};

// --- Match history ---

let matchHistoryId = 1;

const insertMatchHistory = {
  run(room_id, player_address, score, wave) {
    data.matchHistory.push({
      id: matchHistoryId++,
      room_id,
      player_address,
      score,
      wave,
      played_at: Date.now()
    });
    // Keep only last 1000 entries
    if (data.matchHistory.length > 1000) {
      data.matchHistory = data.matchHistory.slice(-1000);
    }
    saveData();
  }
};

const getMatchHistory = {
  all(player_address) {
    return data.matchHistory
      .filter(m => m.player_address === player_address)
      .sort((a, b) => b.played_at - a.played_at)
      .slice(0, 50);
  }
};

// Placeholder for db export (not actually used but keeps API compatible)
const db = { data };

export {
  db,
  upsertPlayer,
  getPlayer,
  updateLastSeen,
  updateStats,
  insertFriendRequest,
  acceptFriendTx,
  rejectFriend,
  removeFriend,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  insertMatchHistory,
  getMatchHistory,
};
