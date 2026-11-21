import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import type { Me } from "./api";
import { Login } from "./Login";
import { Today } from "./Today";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGroup, setShowGroup] = useState(false);

  async function loadMe() {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  if (loading) return <main className="screen muted">Yükleniyor…</main>;
  if (!me) return <Login onLoggedIn={loadMe} />;

  return (
    <main className="screen">
      <header className="topbar">
        <div>
          <h1>{me.group.name}</h1>
          <p className="muted">
            {me.nickname}
            {me.isAdmin && " · yönetici"}
          </p>
        </div>
        <button onClick={() => setShowGroup(!showGroup)}>{showGroup ? "Kapat" : "Grup"}</button>
      </header>

      {showGroup && (
        <div className="card">
          <p className="muted">Davet kodu</p>
          <p className="code">{me.group.inviteCode}</p>
          <p className="muted">Üyeler ({me.group.members.length})</p>
          <ul>
            {me.group.members.map((m) => (
              <li key={m.id}>{m.nickname}</li>
            ))}
          </ul>
          <button
            onClick={() => {
              setToken(null);
              setMe(null);
            }}
          >
            Çıkış
          </button>
        </div>
      )}

      <Today />
    </main>
  );
}
