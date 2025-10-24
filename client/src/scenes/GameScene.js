import Phaser from 'phaser'; 
import NetSync from '../systems/NetSync.js';
import { networkService } from '../services/NetworkService.js';
import AnimController from '../systems/AnimController.js';
import { CFG } from '../core/Config.js';
import { isDesktopLike } from '../utils/DeviceMode.js';
import { computePortraitZoom, computeDesktopZoom, lerpZoom } from '../systems/PortraitZoom.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.otherPlayers = {}; 
    this.enemySprites = {};
    this.bulletSprites = {};
    this._zoomCfg = { BASE_W:480, BASE_H:270, PLAYER_FRAME_H:24, TARGET_PLAYER_PX:20, MIN_WORLD_WIDTH:240, Z_MIN:0.75, Z_MAX:1.0, LERP:0.12 };
    this.localPlayerKey = null;
    this.latestState = null;
  }

  init(data) {
    this.joinRoomId = data?.joinRoomId || null;
    this.profile = data?.profile || { displayName: 'Pilot' };
  }

  async create() {
    this.scoreText = this.add.text(6,6,'Score: 0',{fontFamily:'monospace',fontSize:12,color:'#fff'}).setScrollFactor(0).setDepth(100);
    this.player = this.physics.add.sprite(160,90,'player',0).setDepth(2).setOrigin(0.5);
    this.player.setCollideWorldBounds(true);
    this.pAnim = new AnimController(this.player, { 
      idle_front:'p_idle_front', 
      idle_back:'p_idle_back', 
      walk_front:'p_walk_front', 
      walk_back:'p_walk_back' 
    });

    this.keys = this.input.keyboard.addKeys({ 
      W:Phaser.Input.Keyboard.KeyCodes.W, 
      A:Phaser.Input.Keyboard.KeyCodes.A, 
      S:Phaser.Input.Keyboard.KeyCodes.S, 
      D:Phaser.Input.Keyboard.KeyCodes.D 
    });
    this.cursors = this.input.keyboard.createCursorKeys();

    this.cameras.main.startFollow(this.player,true,0.2,0.2);
    this.physics.world.setBounds(-this.scale.width,-this.scale.height,this.scale.width*3,this.scale.height*3);
    this._applyZoom(true);
    this.scale.on('resize', ()=> this._applyZoom(true));

    try {
      await networkService.joinRoom(this.joinRoomId);
    } catch (e) {
      this.time.delayedCall(1000, ()=> this.scene.start('WaitingRoom'));
      return;
    }

    this.localPlayerKey = networkService.playerKey || networkService.sessionId || null;

    this.netSync = new NetSync(networkService, this, { interpMs: 200, predStrength: 0.0 });
    await this.netSync.start();

    this._lastRenderAt = Date.now();
    this.scene.launch('UI', { profile: this.profile });

  }

  _applyZoom(jump=false) {
    const cam = this.cameras.main;
    if (!cam) return;
    const vw = this.scale.width, vh = this.scale.height;
    let targetZoom = 1;
    try {
      if (isDesktopLike(vw,vh)) targetZoom = computeDesktopZoom({viewW:vw, viewH:vh, baseW:this._zoomCfg.BASE_W, baseH:this._zoomCfg.BASE_H});
      else targetZoom = computePortraitZoom({viewW:vw, viewH:vh, playerFrameH:this._zoomCfg.PLAYER_FRAME_H, TARGET_PLAYER_PX:this._zoomCfg.TARGET_PLAYER_PX, MIN_WORLD_WIDTH:this._zoomCfg.MIN_WORLD_WIDTH, Z_MIN:this._zoomCfg.Z_MIN, Z_MAX:this._zoomCfg.Z_MAX});
    } catch(e) { targetZoom = 1; }
    if (jump) cam.setZoom(targetZoom); else lerpZoom(cam, targetZoom, this._zoomCfg.LERP);
  }

  update(time, delta) {
    this._updateLocalInputRegistry();

    if (this.netSync) {
      this.netSync.renderInterpolated(({ players = {}, enemies = {}, bullets = {}, snapshotMeta = {} }) => {
        const localKey = this.localPlayerKey || networkService.playerKey || networkService.sessionId;

        if (this.debugText) {
          const ids = (snapshotMeta?.playersIds || Object.keys(players) || []).slice(0,6).map(s => (s||'').slice(0,6)).join(',');
        }

        for (const id in players) {
          const p = players[id] || {};

          if (id === localKey) {
          const blend = 0.3;
          if (this.player) {
            if (typeof p.x === 'number' && typeof p.y === 'number') {
              // Blend position slightly toward authoritative
              this.player.x = Phaser.Math.Linear(this.player.x, p.x, blend);
              this.player.y = Phaser.Math.Linear(this.player.y, p.y, blend);
              if (this.scoreText) this.scoreText.setText(`Score: ${Math.floor(p.score||0)}`);
            }
          }
          continue;
        }


          let ent = this.otherPlayers[id];
          if (!ent) {
            const spr = this.add.sprite(p.x || 0, p.y || 0, 'player').setDepth(1).setOrigin(0.5).setScale(1);
            const anim = new AnimController(spr, { idle_front:'p_idle_front', idle_back:'p_idle_back', walk_front:'p_walk_front', walk_back:'p_walk_back' });
            ent = { sprite: spr, anim, lastPos: { x: p.x || 0, y: p.y || 0, t: Date.now() } };
            this.otherPlayers[id] = ent;
          } else {
            const now = Date.now();
            const dt = Math.max(1, now - (ent.lastPos.t || now));
            const vx = (p.x - (ent.lastPos.x||p.x)) / (dt / 1000);
            const vy = (p.y - (ent.lastPos.y||p.y)) / (dt / 1000);

            if (typeof p.x === 'number' && typeof p.y === 'number') {
              ent.sprite.x = Phaser.Math.Linear(ent.sprite.x, p.x, 0.6);
              ent.sprite.y = Phaser.Math.Linear(ent.sprite.y, p.y, 0.6);
            }

            // update anim based on estimated velocity
            const speed = Math.hypot(vx, vy);
            if (speed > 5) {
              ent.anim.updateFromVelocity(vx, vy);
            } else {
              ent.anim.updateFromVelocity(0, 0); // idle
            }


            ent.lastPos.x = (typeof p.x === 'number') ? p.x : ent.lastPos.x;
            ent.lastPos.y = (typeof p.y === 'number') ? p.y : ent.lastPos.y;
            ent.lastPos.t = now;
          }
        }

        for (const id in enemies) {
          const e = enemies[id] || {};
          let s = this.enemySprites[id];
          if (!s) {
            s = this.add.sprite(e.x || 0, e.y || 0, 'e_walk_front').setScale(0.7).setDepth(1).setOrigin(0.5);
            this.enemySprites[id] = s;
          } else if (typeof e.x === 'number' && typeof e.y === 'number') {
            s.x = e.x; s.y = e.y;
          }
        }

        for (const id in bullets) {
          const b = bullets[id] || {};
          let s = this.bulletSprites[id];
          if (!s) {
            s = this.add.sprite(b.x || 0, b.y || 0, 'bullet').setScale(0.5).setDepth(2).setOrigin(0.5);
            this.bulletSprites[id] = s;
          } else if (typeof b.x === 'number' && typeof b.y === 'number') {
            s.x = b.x; s.y = b.y;
          }
        }

        for (const id in this.otherPlayers) if (!players[id]) { try{ this.otherPlayers[id].sprite.destroy(); }catch{} delete this.otherPlayers[id]; }
        for (const id in this.enemySprites) if (!enemies[id]) { try{ this.enemySprites[id].destroy(); }catch{} delete this.enemySprites[id]; }
        for (const id in this.bulletSprites) if (!bullets[id]) { try{ this.bulletSprites[id].destroy(); }catch{} delete this.bulletSprites[id]; }
      });
    }

    if (this.pAnim && this.player?.body) this.pAnim.updateFromVelocity(this.player.body.velocity.x, this.player.body.velocity.y);
  }

  _updateLocalInputRegistry() {
    // Retrieve input from UI scene (VirtualDPad + AimTouchZone)
    const registry = this.registry.get('input') || { vector: { x: 0, y: 0 }, aim: null, aimHeld: false };
    const vx = registry.vector.x;
    const vy = registry.vector.y;

    // Apply keyboard input fallback (for desktop)
    const keyVX = ((this.keys?.D?.isDown ? 1 : 0) - (this.keys?.A?.isDown ? 1 : 0));
    const keyVY = ((this.keys?.S?.isDown ? 1 : 0) - (this.keys?.W?.isDown ? 1 : 0));
    const finalVX = vx || keyVX;
    const finalVY = vy || keyVY;

    // Local movement prediction
    try {
      const speed = (CFG?.player?.speed || 80);
      const mag = Math.hypot(finalVX, finalVY);
      let localVx = 0, localVy = 0;
      if (mag > 0) {
        localVx = (finalVX / mag) * speed;
        localVy = (finalVY / mag) * speed;
      }
      if (this.player?.body?.setVelocity) {
        this.player.body.setVelocity(localVx, localVy);
      }
    } catch (_) {}

    // Send input to server (includes D-pad and aim touch)
    try {
      networkService.sendInput({
        up: !!(finalVY < 0),
        down: !!(finalVY > 0),
        left: !!(finalVX < 0),
        right: !!(finalVX > 0),
        aimX: registry.aim?.x ?? null,
        aimY: registry.aim?.y ?? null,
        shoot: registry.aimHeld, // true while aim touch is held
        seq: (this._inputSeq = (this._inputSeq || 0) + 1)
      });
    } catch (_) {}
  }

  shutdown() {
    this.netSync?.stop();
    for (const k in this.otherPlayers) { try{ this.otherPlayers[k].sprite.destroy(); }catch{} }
    for (const k in this.enemySprites) { try{ this.enemySprites[k].destroy(); }catch{} }
    for (const k in this.bulletSprites) { try{ this.bulletSprites[k].destroy(); }catch{} }
  }
}
