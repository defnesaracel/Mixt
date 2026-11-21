const TOKEN_KEY = "gunun-sarkisi-token";

export type Member = { id: number; nickname: string; isAdmin: boolean };
export type Group = { id: number; name: string; inviteCode: string; members: Member[] };
export type Me = { userId: number; nickname: string; isAdmin: boolean; group: Group };

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // depolama kapalıysa oturum sadece bu sekmede yaşar
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Bir şeyler ters gitti");
  return data as T;
}
