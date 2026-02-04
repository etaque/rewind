import { loadAccount, getActiveProfile } from "./account";

const GUEST_ID_KEY = "rewind:guest_id";

/**
 * Get the current player ID.
 * If signed in, returns the active profile ID.
 * If guest, returns a persistent guest ID (created if needed).
 */
export function getOrCreatePlayerId(): string {
  // Check if signed in with an account
  const account = loadAccount();
  if (account) {
    const profile = getActiveProfile(account);
    if (profile) {
      return profile.id;
    }
  }

  // Fall back to guest mode
  return getOrCreateGuestId();
}

/**
 * Get or create a guest ID for anonymous users.
 */
export function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(GUEST_ID_KEY, id);
  return id;
}

/**
 * Check if the current user is signed in (has an account).
 */
export function isSignedIn(): boolean {
  const account = loadAccount();
  return account !== null && account.profiles.length > 0;
}
