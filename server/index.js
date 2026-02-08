import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Server } from 'colyseus';
import { matchMaker } from '@colyseus/core';
import { randomBytes } from 'crypto';
import { GameRoom } from './rooms/GameRoom.js';
import { monitor } from '@colyseus/monitor';

// Social layer imports
import './db.js'; // init SQLite on startup
import profileRouter from './routes/profile.js';
import friendsRouter from './routes/friends.js';
import squadRouter from './routes/squad.js';
import matchRouter from './routes/match.js';
import { createSocialWss } from './social/wsHandler.js';
import { presence } from './social/presence.js';
import { matchmaking } from './social/matchmaking.js';
import { getPlayer } from './db.js';

const app = express();
app.use("/colyseus", monitor())
app.use(cors());
app.use(bodyParser.json());

// simple in-memory nonce store (dev only)
const nonces = new Map();
app.get('/nonce/:address', (req, res) => {
  const address = (req.params.address || '').toLowerCase();
  if (!address) return res.status(400).json({ error: 'missing address' });
  const nonce = randomBytes(16).toString('hex');
  nonces.set(address, nonce);
  res.json({ nonce });
});
app.get('/nonce/verify/:address/:nonce', (req, res) => {
  const a = (req.params.address || '').toLowerCase();
  const n = req.params.nonce;
  res.json({ valid: nonces.get(a) === n });
});

// REST API routes
app.use('/api', profileRouter);
app.use('/api', friendsRouter);
app.use('/api', squadRouter);
app.use('/api', matchRouter);

// GET /api/online — list online players (for discovery)
app.get('/api/online', (req, res) => {
  const addresses = presence.getOnlineAddresses();
  const players = addresses.map(addr => {
    const p = getPlayer.get(addr);
    return {
      address: addr,
      displayName: p?.display_name || 'Guest',
      baseName: p?.base_name || null,
    };
  });
  res.json({ players });
});

const server = http.createServer(app);

const gameServer = new Server({
  server,
});

gameServer.define('borc_room', GameRoom);

// expose useful globals
global.__GAME_SERVER__ = gameServer;
global.__MATCH_MAKER__ = matchMaker;

// --- WebSocket upgrade routing ---
// Social WS must be intercepted before Colyseus handles upgrades
const socialWss = createSocialWss();

const colyseusUpgradeListeners = server.listeners('upgrade').slice();
server.removeAllListeners('upgrade');

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/ws/social') {
    socialWss.handleUpgrade(req, socket, head, (ws) => {
      socialWss.emit('connection', ws, req);
    });
  } else {
    // Forward to Colyseus
    for (const fn of colyseusUpgradeListeners) {
      fn.call(server, req, socket, head);
    }
  }
});

// Start presence heartbeat and matchmaking processor
presence.start();
matchmaking.start();

const port = process.env.PORT || 2567;
server.listen(port, () => console.log('Listening on', port));
