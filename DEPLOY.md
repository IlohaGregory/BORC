# BORC - Base Mini App Deployment Guide

## Quick Deploy

### Prerequisites
- Node.js 16+
- Production server URL set in `.env`

### Build for Base Mini App
```bash
cd client
npm run build:miniapp
```

### Deploy Targets

#### Vercel (Current)
```bash
vercel --prod
```

#### Static Hosting (Netlify, Cloudflare Pages, etc.)
```bash
cd client
npm run build:miniapp
# Upload ./dist folder to hosting
```

#### Nginx
```bash
cd client
npm run build:miniapp
# Copy dist/* to /usr/share/nginx/html/
# Use client/nginx.conf as config template
```

#### Apache
```bash
cd client
npm run build:miniapp
# Copy dist/* to web root
# .htaccess is already included in build
```

## Environment Variables

Copy `client/.env.example` to `client/.env` and configure:

```env
VITE_SERVER_URL=https://borc-xxyf.onrender.com
VITE_CHAIN_ID=8453
VITE_BASE_APP_ID=69891fb96dea3c7b8e14a02a
```

## Base Mini App Requirements

✅ **Implemented:**
- Base Mini App manifest at `/miniapp.manifest.json`
- Mobile-optimized Phaser config
- WebSocket reconnection on mobile background/resume
- Guest mode (no wallet required for solo play)
- Safe EVM provider detection (no window.ethereum override)
- HTTPS ready
- Production build optimization
- Static asset caching

## Verification

After deployment, verify:
1. Visit `https://your-domain.com/miniapp.manifest.json` - should return valid JSON
2. Open dev tools console - no localhost references
3. Test on mobile - touch controls work
4. Background app and resume - WebSocket reconnects
5. Play without wallet - solo mode accessible

## Base Mini App Submission

Submit to Base Mini App directory:
- Manifest URL: `https://your-domain.com/miniapp.manifest.json`
- App ID: `69891fb96dea3c7b8e14a02a`
- Chain: Base Mainnet (8453)

## Troubleshooting

**WebSocket connection fails:**
- Ensure `VITE_SERVER_URL` uses HTTPS in production
- Check CORS on server allows your domain

**Wallet not detected:**
- Guest mode is automatic - users can play solo without wallet
- For multiplayer, users must have Coinbase Wallet or MetaMask

**Performance issues:**
- Mobile build has console logs stripped
- Phaser config optimized for mobile GPU
- Check network tab for asset compression
