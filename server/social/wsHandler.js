import { WebSocketServer } from 'ws';
import { presence } from './presence.js';
import { squads } from './squads.js';

export function createSocialWss() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const address = (url.searchParams.get('address') || '').toLowerCase();

    if (!address || !address.startsWith('0x')) {
      ws.close(4001, 'Missing or invalid address');
      return;
    }

    presence.add(address, ws);
    console.log(`[Social WS] Connected: ${address}`);

    ws.on('pong', () => {
      ws._alive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      console.log(`[Social WS] Disconnected: ${address}`);
      presence.remove(address);
      // Auto-leave squad on disconnect
      squads.leaveByAddress(address);
    });

    ws.on('error', () => {
      presence.remove(address);
      squads.leaveByAddress(address);
    });
  });

  return wss;
}
