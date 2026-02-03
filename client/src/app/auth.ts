const AUTH_TOKEN_KEY = "rewind:auth_token";
const EMAIL_KEY = "rewind:email";

/**
 * Get the stored auth token (if verified)
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Check if the current user is verified
 */
export function isVerified(): boolean {
  return getAuthToken() !== null;
}

/**
 * Store verification data after successful email verification
 */
export function setVerified(authToken: string, email: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  localStorage.setItem(EMAIL_KEY, email);
}

/**
 * Get the verified email (if any)
 */
export function getVerifiedEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

/**
 * Clear verification data (logout)
 */
export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

/**
 * Mask an email address for display (e.g., "j***@example.com")
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return "***";
  if (atIndex <= 1) return `*${email.slice(atIndex)}`;
  return `${email[0]}***${email.slice(atIndex)}`;
}
