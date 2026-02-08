import { Router } from 'express';
import {
  getFriends, getIncomingRequests, getOutgoingRequests,
  insertFriendRequest, acceptFriendTx, rejectFriend, removeFriend,
  getPlayer
} from '../db.js';
import { presence } from '../social/presence.js';

const router = Router();

// GET /api/friends/:address — accepted friends with online status
router.get('/friends/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  const rows = getFriends.all(address);
  const friends = rows.map(r => ({
    address: r.address,
    displayName: r.display_name || 'Guest',
    baseName: r.base_name,
    online: presence.isOnline(r.address),
    lastSeen: r.last_seen,
  }));

  res.json({ friends });
});

// GET /api/friends/:address/requests — pending incoming + outgoing
router.get('/friends/:address/requests', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  const incoming = getIncomingRequests.all(address).map(r => ({
    address: r.address,
    displayName: r.display_name || 'Guest',
    baseName: r.base_name,
  }));

  const outgoing = getOutgoingRequests.all(address).map(r => ({
    address: r.address,
    displayName: r.display_name || 'Guest',
    baseName: r.base_name,
  }));

  res.json({ incoming, outgoing });
});

// POST /api/friends/request — send friend request
router.post('/friends/request', (req, res) => {
  const from = (req.body.from || '').toLowerCase();
  const to = (req.body.to || '').toLowerCase();
  if (!from || !to) return res.status(400).json({ error: 'missing from/to' });
  if (from === to) return res.status(400).json({ error: 'cannot friend yourself' });

  const toPlayer = getPlayer.get(to);
  if (!toPlayer) return res.status(404).json({ error: 'target player not found' });

  insertFriendRequest.run(from, to);

  // Push notification via WebSocket
  const fromPlayer = getPlayer.get(from);
  presence.send(to, 'friend_request', {
    from,
    displayName: fromPlayer?.display_name || 'Someone',
  });

  res.json({ ok: true });
});

// POST /api/friends/accept — accept friend request
router.post('/friends/accept', (req, res) => {
  const from = (req.body.from || '').toLowerCase();
  const to = (req.body.to || '').toLowerCase();
  if (!from || !to) return res.status(400).json({ error: 'missing from/to' });

  acceptFriendTx(from, to);

  // Notify requester that their request was accepted
  const toPlayer = getPlayer.get(to);
  presence.send(from, 'friend_accepted', {
    address: to,
    displayName: toPlayer?.display_name || 'Someone',
  });

  res.json({ ok: true });
});

// POST /api/friends/reject — reject friend request
router.post('/friends/reject', (req, res) => {
  const from = (req.body.from || '').toLowerCase();
  const to = (req.body.to || '').toLowerCase();
  if (!from || !to) return res.status(400).json({ error: 'missing from/to' });

  rejectFriend.run(from, to);
  res.json({ ok: true });
});

// DELETE /api/friends/:owner/:friend — remove friendship
router.delete('/friends/:owner/:friend', (req, res) => {
  const owner = (req.params.owner || '').toLowerCase();
  const friend = (req.params.friend || '').toLowerCase();
  if (!owner || !friend) return res.status(400).json({ error: 'missing params' });

  removeFriend.run(owner, friend, friend, owner);
  res.json({ ok: true });
});

export default router;
