import { Router } from 'express';
import { squads } from '../social/squads.js';
import { presence } from '../social/presence.js';
import { getPlayer } from '../db.js';

const router = Router();

// POST /api/squad/create
router.post('/squad/create', (req, res) => {
  const leader = (req.body.leader || '').toLowerCase();
  if (!leader) return res.status(400).json({ error: 'missing leader' });

  const squad = squads.create(leader);
  res.json({ squadId: squad.id, squad });
});

// GET /api/squad/:id
router.get('/squad/:id', (req, res) => {
  const squad = squads.get(req.params.id);
  if (!squad) return res.status(404).json({ error: 'squad not found' });
  res.json({ squad });
});

// GET /api/squad/mine/:address
router.get('/squad/mine/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  const squad = squads.getByMember(address);
  res.json({ squad: squad || null });
});

// POST /api/squad/invite
router.post('/squad/invite', (req, res) => {
  const squadId = req.body.squadId;
  const from = (req.body.from || '').toLowerCase();
  const to = (req.body.to || '').toLowerCase();
  if (!squadId || !from || !to) return res.status(400).json({ error: 'missing fields' });

  const squad = squads.get(squadId);
  if (!squad) return res.status(404).json({ error: 'squad not found' });

  const fromPlayer = getPlayer.get(from);
  const fromName = fromPlayer?.base_name || fromPlayer?.display_name || 'Someone';

  presence.send(to, 'squad_invite', { squadId, from, fromName });
  res.json({ ok: true });
});

// POST /api/squad/join
router.post('/squad/join', (req, res) => {
  const squadId = req.body.squadId;
  const address = (req.body.address || '').toLowerCase();
  if (!squadId || !address) return res.status(400).json({ error: 'missing fields' });

  const result = squads.join(squadId, address);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, squad: result.squad });
});

// POST /api/squad/leave
router.post('/squad/leave', (req, res) => {
  const squadId = req.body.squadId;
  const address = (req.body.address || '').toLowerCase();
  if (!squadId || !address) return res.status(400).json({ error: 'missing fields' });

  squads.leave(squadId, address);
  res.json({ ok: true });
});

// POST /api/squad/ready
router.post('/squad/ready', (req, res) => {
  const squadId = req.body.squadId;
  const address = (req.body.address || '').toLowerCase();
  const ready = req.body.ready;
  if (!squadId || !address) return res.status(400).json({ error: 'missing fields' });

  const result = squads.setReady(squadId, address, ready);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
