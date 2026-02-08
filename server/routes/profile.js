import { Router } from 'express';
import { upsertPlayer, getPlayer } from '../db.js';

const router = Router();

// GET /api/profile/:address
router.get('/profile/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  const row = getPlayer.get(address);
  if (!row) return res.status(404).json({ error: 'not found' });

  res.json({
    address: row.address,
    displayName: row.display_name,
    baseName: row.base_name,
    totalScore: row.total_score,
    gamesPlayed: row.games_played,
    highestWave: row.highest_wave,
  });
});

// PUT /api/profile/:address
router.put('/profile/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });

  const displayName = (req.body.displayName || '').trim() || 'Guest';
  const baseName = req.body.baseName?.trim() || null;
  const now = Date.now();

  upsertPlayer.run(address, displayName, baseName, now);
  const row = getPlayer.get(address);

  res.json({
    ok: true,
    profile: {
      address: row.address,
      displayName: row.display_name,
      baseName: row.base_name,
      totalScore: row.total_score,
      gamesPlayed: row.games_played,
      highestWave: row.highest_wave,
    }
  });
});

export default router;
