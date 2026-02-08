import { randomBytes } from 'crypto';
import { presence } from './presence.js';
import { getPlayer } from '../db.js';

class SquadManager {
  constructor() {
    /** @type {Map<string, { id: string, leader: string, members: Array<{address: string, displayName: string, ready: boolean}> }>} */
    this.squads = new Map();
  }

  create(leaderAddress) {
    // Leave any existing squad first
    this.leaveByAddress(leaderAddress);

    const id = 's_' + randomBytes(4).toString('hex');
    const player = getPlayer.get(leaderAddress);
    const displayName = player?.base_name || player?.display_name || 'Guest';

    const squad = {
      id,
      leader: leaderAddress,
      members: [{ address: leaderAddress, displayName, ready: true }],
    };
    this.squads.set(id, squad);
    this._pushUpdate(squad);
    return squad;
  }

  get(squadId) {
    return this.squads.get(squadId) || null;
  }

  getByMember(address) {
    for (const sq of this.squads.values()) {
      if (sq.members.some(m => m.address === address)) return sq;
    }
    return null;
  }

  join(squadId, address) {
    const squad = this.squads.get(squadId);
    if (!squad) return { error: 'Squad not found' };
    if (squad.members.length >= 3) return { error: 'Squad is full (max 3)' };
    if (squad.members.some(m => m.address === address)) return { error: 'Already in squad' };

    // Leave any existing squad first
    this.leaveByAddress(address);

    const player = getPlayer.get(address);
    const displayName = player?.base_name || player?.display_name || 'Guest';
    squad.members.push({ address, displayName, ready: false });
    this._pushUpdate(squad);
    return { ok: true, squad };
  }

  leave(squadId, address) {
    const squad = this.squads.get(squadId);
    if (!squad) return;

    squad.members = squad.members.filter(m => m.address !== address);

    if (squad.members.length === 0) {
      this.squads.delete(squadId);
      presence.send(address, 'squad_disbanded', { squadId });
      return;
    }

    // Reassign leader if needed
    if (squad.leader === address) {
      squad.leader = squad.members[0].address;
      squad.members[0].ready = true;
    }

    this._pushUpdate(squad);
    presence.send(address, 'squad_disbanded', { squadId });
  }

  leaveByAddress(address) {
    const squad = this.getByMember(address);
    if (squad) this.leave(squad.id, address);
  }

  setReady(squadId, address, ready) {
    const squad = this.squads.get(squadId);
    if (!squad) return { error: 'Squad not found' };

    const member = squad.members.find(m => m.address === address);
    if (!member) return { error: 'Not in squad' };

    // Leader is always ready
    if (squad.leader === address) {
      member.ready = true;
    } else {
      member.ready = !!ready;
    }

    this._pushUpdate(squad);
    return { ok: true };
  }

  disband(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return;

    const addresses = squad.members.map(m => m.address);
    this.squads.delete(squadId);
    presence.broadcast(addresses, 'squad_disbanded', { squadId });
  }

  allReady(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return false;
    return squad.members.every(m => m.ready);
  }

  _pushUpdate(squad) {
    const payload = {
      squad: {
        id: squad.id,
        leader: squad.leader,
        members: squad.members,
      }
    };
    const addresses = squad.members.map(m => m.address);
    presence.broadcast(addresses, 'squad_update', payload);
  }
}

export const squads = new SquadManager();
