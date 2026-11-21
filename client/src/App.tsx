import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import type { Me } from "./api";
import { Login } from "./Login";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

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
      <h1>{me.group.name}</h1>
      <p>
        Merhaba <strong>{me.nickname}</strong>
        {me.isAdmin && " (yönetici)"}
      </p>
      <div className="card">
        <p className="muted">Davet kodu</p>
        <p className="code">{me.group.inviteCode}</p>
      </div>
      <div className="card">
        <p className="muted">Üyeler ({me.group.members.length})</p>
        <ul>
          {me.group.members.map((m) => (
            <li key={m.id}>{m.nickname}</li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => {
          setToken(null);
          setMe(null);
        }}
      >
        Çıkış
      </button>
    </main>
  );
}
