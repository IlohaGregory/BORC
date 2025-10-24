import express from 'express';
import http from 'http'; 
import cors from 'cors'; 
import bodyParser from 'body-parser'; 
import { Server } from 'colyseus';
import { matchMaker } from '@colyseus/core';
import { randomBytes } from 'crypto';
import { GameRoom } from './rooms/GameRoom.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';
import { monitor } from '@colyseus/monitor';

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

const server = http.createServer(app);

const gameServer = new Server({
  server,
  // transport options left default
});

gameServer.define('borc_room', GameRoom);
gameServer.define('borc_lobby', LobbyRoom, {maxClients: 1000});

// expose useful globals (for compatibility with earlier code)
global.__GAME_SERVER__ = gameServer;
global.__MATCH_MAKER__ = matchMaker;

const port = process.env.PORT || 2567;
server.listen(port, () => console.log('Listening on', port));

