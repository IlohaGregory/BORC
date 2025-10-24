/**
 * ProfileService.js — ultra-light persistence for display name.
 * Later, you can replace this with a backend or Supabase to support global leaderboards.
 */
const KEY = 'borc_profile';

class ProfileService {
  load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  }
  save(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }
}

export const profileService = new ProfileService();
