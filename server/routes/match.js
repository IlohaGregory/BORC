import { Router } from 'express';
import { squads } from '../social/squads.js';
import { presence } from '../social/presence.js';
import { matchmaking } from '../social/matchmaking.js';

const router = Router();

// Track pending matches to prevent double-start
const pendingMatches = new Set();

// POST /api/match/start — leader starts a match for their squad
router.post('/match/start', async (req, res) => {
  const squadId = req.body.squadId;
  const leader = (req.body.leader || '').toLowerCase();
  const missionId = req.body.missionId || null; // Optional mission selection (legacy)
  const difficulty = req.body.difficulty || null; // NEW: Difficulty-based procedural generation
  if (!squadId || !leader) return res.status(400).json({ error: 'missing fields' });

  const squad = squads.get(squadId);
  if (!squad) return res.status(404).json({ error: 'squad not found' });
  if (squad.leader !== leader) return res.status(403).json({ error: 'only leader can start' });
  if (pendingMatches.has(squadId)) return res.status(409).json({ error: 'match already starting' });
  if (!squads.allReady(squadId)) return res.status(400).json({ error: 'not all members ready' });

  pendingMatches.add(squadId);
  res.json({ ok: true });

  // Async match creation — results pushed via WebSocket
  try {
    await _createMatchForSquad(squad, { missionId, difficulty });
  } catch (e) {
    console.error('[Match] start failed:', e);
    const addresses = squad.members.map(m => m.address);
    presence.broadcast(addresses, 'game_ready_error', { message: e.message || 'Match creation failed' });
  } finally {
    pendingMatches.delete(squadId);
  }
});

// POST /api/match/matchmaking — enter matchmaking queue
router.post('/match/matchmaking', (req, res) => {
  const address = (req.body.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  matchmaking.enqueue(address);
  presence.send(address, 'matchmaking_status', { status: 'searching' });
  res.json({ ok: true, status: 'searching' });
});

// DELETE /api/match/matchmaking/:address — leave matchmaking queue
router.delete('/match/matchmaking/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  matchmaking.dequeue(address);
  presence.send(address, 'matchmaking_status', { status: 'stopped' });
  res.json({ ok: true });
});

/** Create a Colyseus GameRoom for a squad and send reservations via WS */
export async function _createMatchForSquad(squad, options = {}) {
  const matchMaker = global.__MATCH_MAKER__;
  if (!matchMaker) throw new Error('matchMaker not available');

  const allowedAddresses = squad.members.map(m => m.address).filter(Boolean);
  const maxClients = Math.min(squad.members.length, 3);

  const roomOptions = {
    locked: true,
    maxClients,
    allowedAddresses,
  };

  // Prefer difficulty-based procedural generation over static missionId
  if (options.difficulty) {
    roomOptions.difficulty = parseInt(options.difficulty, 10);
  } else if (options.missionId) {
    roomOptions.missionId = options.missionId;
  }

  const room = await matchMaker.createRoom('borc_room', roomOptions);

  // Wait for room to be fully registered (cold start safety)
  await new Promise(r => setTimeout(r, 800));

  // Reserve seats for each member
  for (const member of squad.members) {
    try {
      const reservation = await matchMaker.reserveSeatFor(room, {
        playerId: member.address,
      });
      presence.send(member.address, 'game_ready', {
        reservation,
        missionId: options.missionId || null,
        difficulty: options.difficulty || null
      });
    } catch (e) {
      console.error(`[Match] reserveSeatFor ${member.address} failed:`, e);
      presence.send(member.address, 'game_ready_error', { message: 'Seat reservation failed' });
    }
  }

  // Disband squad after successful start
  squads.disband(squad.id);
}

export default router;
