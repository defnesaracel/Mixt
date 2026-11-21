import { useState } from "react";
import { api, setToken } from "./api";

type Mode = "join" | "create";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("join");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "join"
          ? await api<{ token: string }>("/api/groups/join", { nickname, code })
          : await api<{ token: string }>("/api/groups", { nickname, groupName });
      setToken(result.token);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <h1>Günün Şarkısı</h1>
      <p className="muted">Her gün bir soru, herkes bir şarkı. Kim neyi seçti?</p>

      <div className="tabs">
        <button className={mode === "join" ? "tab active" : "tab"} onClick={() => setMode("join")}>
          Gruba katıl
        </button>
        <button className={mode === "create" ? "tab active" : "tab"} onClick={() => setMode("create")}>
          Yeni grup kur
        </button>
      </div>

      <form onSubmit={submit} className="stack">
        <label>
          Takma ad
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} required />
        </label>
        {mode === "join" ? (
          <label>
            Davet kodu
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              required
            />
          </label>
        ) : (
          <label>
            Grup adı (isteğe bağlı)
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={40} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {mode === "join" ? "Katıl" : "Grubu kur"}
        </button>
      </form>
    </main>
  );
}
