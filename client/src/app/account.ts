const serverUrl = import.meta.env.REWIND_SERVER_URL;
const ACCOUNT_KEY = "rewind:account";

export type Profile = {
  id: string;
  name: string;
};

export type Account = {
  email: string;
  sessionToken: string;
  profiles: Profile[];
  activeProfileId: string;
};

// ===== Local Storage =====

export function loadAccount(): Account | null {
  try {
    const json = localStorage.getItem(ACCOUNT_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function saveAccount(account: Account): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearAccount(): void {
  localStorage.removeItem(ACCOUNT_KEY);
}

// ===== Active Profile =====

export function getActiveProfile(account: Account | null): Profile | null {
  if (!account) return null;
  return account.profiles.find((p) => p.id === account.activeProfileId) ?? null;
}

export function setActiveProfile(account: Account, profileId: string): Account {
  const profile = account.profiles.find((p) => p.id === profileId);
  if (!profile) return account;
  const updated = { ...account, activeProfileId: profileId };
  saveAccount(updated);
  return updated;
}

// ===== API Helpers =====

function authHeaders(account: Account): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${account.sessionToken}`,
  };
}

// ===== Auth API =====

export async function startAuth(email: string): Promise<void> {
  const res = await fetch(`${serverUrl}/auth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to send verification code");
  }
}

type VerifyAuthResponse = {
  accountId: string;
  sessionToken: string;
  profiles: Profile[];
};

export async function verifyAuth(
  email: string,
  code: string
): Promise<Account> {
  const res = await fetch(`${serverUrl}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Invalid or expired code");
  }
  const data: VerifyAuthResponse = await res.json();

  // Create account object with first profile as active
  const account: Account = {
    email,
    sessionToken: data.sessionToken,
    profiles: data.profiles,
    activeProfileId: data.profiles[0]?.id ?? "",
  };

  saveAccount(account);
  return account;
}

export async function logout(account: Account): Promise<void> {
  try {
    await fetch(`${serverUrl}/auth/logout`, {
      method: "POST",
      headers: authHeaders(account),
    });
  } catch {
    // Ignore errors - we're logging out anyway
  }
  clearAccount();
}

// ===== Profile API =====

export async function fetchProfiles(account: Account): Promise<Profile[]> {
  const res = await fetch(`${serverUrl}/account/profiles`, {
    headers: authHeaders(account),
  });
  if (!res.ok) {
    throw new Error("Failed to fetch profiles");
  }
  return res.json();
}

export async function createProfile(
  account: Account,
  name: string
): Promise<Account> {
  const res = await fetch(`${serverUrl}/account/profiles`, {
    method: "POST",
    headers: authHeaders(account),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create profile");
  }
  const profile: Profile = await res.json();

  // Add to account and make it active
  const updated: Account = {
    ...account,
    profiles: [...account.profiles, profile],
    activeProfileId: profile.id,
  };
  saveAccount(updated);
  return updated;
}

export async function updateProfile(
  account: Account,
  profileId: string,
  name: string
): Promise<Account> {
  const res = await fetch(`${serverUrl}/account/profiles/${profileId}`, {
    method: "PUT",
    headers: authHeaders(account),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update profile");
  }
  const updatedProfile: Profile = await res.json();

  // Update profile in account
  const updated: Account = {
    ...account,
    profiles: account.profiles.map((p) =>
      p.id === profileId ? updatedProfile : p
    ),
  };
  saveAccount(updated);
  return updated;
}

export async function deleteProfile(
  account: Account,
  profileId: string
): Promise<Account> {
  const res = await fetch(`${serverUrl}/account/profiles/${profileId}`, {
    method: "DELETE",
    headers: authHeaders(account),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete profile");
  }

  // Remove from account
  const remainingProfiles = account.profiles.filter((p) => p.id !== profileId);
  const updated: Account = {
    ...account,
    profiles: remainingProfiles,
    // If we deleted the active profile, switch to first remaining
    activeProfileId:
      account.activeProfileId === profileId
        ? remainingProfiles[0]?.id ?? ""
        : account.activeProfileId,
  };
  saveAccount(updated);
  return updated;
}
