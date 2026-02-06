const serverUrl = import.meta.env.REWIND_SERVER_URL;

function authHeaders(sessionToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };
}

export type AdminAccount = {
  id: string;
  email: string;
  createdAt: number;
  profileCount: number;
  sessionCount: number;
};

export type AdminRaceResult = {
  id: number;
  courseKey: string;
  playerName: string;
  playerId: string | null;
  finishTime: number;
  raceStartTime: number;
  pathS3Key: string;
  createdAt: number | null;
};

type AccountsResponse = {
  accounts: AdminAccount[];
  total: number;
};

type ResultsResponse = {
  results: AdminRaceResult[];
  total: number;
};

export async function fetchAccounts(
  sessionToken: string,
  limit = 50,
  offset = 0,
): Promise<AccountsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${serverUrl}/admin/accounts?${params}`, {
    headers: authHeaders(sessionToken),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return res.json();
}

export async function deleteAccount(
  sessionToken: string,
  accountId: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/admin/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to delete account");
}

export async function fetchResults(
  sessionToken: string,
  limit = 50,
  offset = 0,
  courseKey?: string,
): Promise<ResultsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (courseKey) params.set("course_key", courseKey);
  const res = await fetch(`${serverUrl}/admin/results?${params}`, {
    headers: authHeaders(sessionToken),
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to fetch results");
  return res.json();
}

export async function deleteResult(
  sessionToken: string,
  resultId: number,
): Promise<void> {
  const res = await fetch(`${serverUrl}/admin/results/${resultId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error("Failed to delete result");
}
