import { useEffect, useState } from "react";
import { api } from "./api";
import type { GuessData, Song, TodayData } from "./api";

const REFRESH_MS = 5000;

export function Today() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await api<TodayData>("/api/rounds/today"));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!data) return <p className="muted">{error || "Yükleniyor…"}</p>;

  return (
    <section className="stack">
      <div className="card prompt">
        <p className="muted">Günün sorusu</p>
        <h2>{data.round.prompt}</h2>
      </div>

      {data.round.phase === "pick" && <PickPhase data={data} onPicked={load} />}
      {data.round.phase === "guess" && data.guess && (
        <GuessPhase roundId={data.round.id} memberCount={data.memberCount} guess={data.guess} onChanged={load} />
      )}
      {data.round.phase === "result" && <p className="muted">Herkes bitirdi! Sonuç ekranı yakında.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function PickPhase({ data, onPicked }: { data: TodayData; onPicked: () => void }) {
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ songs: Song[] }>(`/api/songs/search?q=${encodeURIComponent(query)}`);
        setSongs(result.songs);
      } catch (err) {
        setError((err as Error).message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(song: Song) {
    setBusyId(song.id);
    setError("");
    try {
      await api(`/api/rounds/${data.round.id}/pick`, { songId: song.id });
      onPicked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const isMine = (song: Song) =>
    data.myPick?.title === song.title && data.myPick?.artist === song.artist;

  return (
    <>
      <p className="progress">
        {data.pickedCount === data.memberCount
          ? `Herkes seçti (${data.pickedCount}/${data.memberCount})`
          : `Bekleniyor (${data.pickedCount}/${data.memberCount} seçti)`}
      </p>

      {data.myPick && (
        <div className="card mine">
          <p className="muted">Senin seçimin (değiştirebilirsin)</p>
          <SongRow title={data.myPick.title} artist={data.myPick.artist} />
        </div>
      )}

      <input
        type="search"
        placeholder="Şarkı ya da sanatçı ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="error">{error}</p>}

      <ul className="song-list">
        {songs.map((song) => (
          <li key={song.id}>
            <button
              className={isMine(song) ? "song selected" : "song"}
              onClick={() => pick(song)}
              disabled={busyId !== null || isMine(song)}
            >
              <SongRow title={song.title} artist={song.artist} />
              <span className="action">{isMine(song) ? "Seçildi" : "Seç"}</span>
            </button>
          </li>
        ))}
        {songs.length === 0 && <li className="muted">Sonuç yok</li>}
      </ul>
    </>
  );
}

function SongRow({ title, artist }: { title: string; artist: string }) {
  return (
    <span className="song-row">
      <span className="cover" aria-hidden>
        {title[0]}
      </span>
      <span className="song-text">
        <strong>{title}</strong>
        <span className="muted">{artist}</span>
      </span>
    </span>
  );
}

function GuessPhase({
  roundId,
  memberCount,
  guess,
  onChanged,
}: {
  roundId: number;
  memberCount: number;
  guess: GuessData;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(action: "guess" | "vote", body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/rounds/${roundId}/${action}`, body);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const others = guess.songs.filter((s) => !s.isMine);
  const guessedCount = others.filter((s) => guess.myGuesses[s.pickId] !== undefined).length;
  const iAmDone = guessedCount === others.length && (others.length === 0 || guess.myVote !== null);

  return (
    <>
      <p className="muted">
        Her şarkıyı kimin seçtiğini tahmin et ve en sevdiğine oy ver.
      </p>
      <p className="progress">
        {iAmDone ? "Tamamladın! " : `Tahmin ${guessedCount}/${others.length}, oy ${guess.myVote ? "✓" : "yok"} · `}
        {guess.finishedCount}/{memberCount} kişi bitirdi
      </p>
      {error && <p className="error">{error}</p>}

      <ul className="song-list">
        {guess.songs.map((song) => {
          const voted = guess.myVote === song.pickId;
          return (
            <li key={song.pickId} className={song.isMine ? "card mine" : voted ? "card voted" : "card"}>
              <SongRow title={song.title} artist={song.artist} />
              {song.isMine ? (
                <p className="muted">Senin seçimin</p>
              ) : (
                <div className="guess-controls">
                  <select
                    aria-label="Bunu kim seçti?"
                    value={guess.myGuesses[song.pickId] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      send("guess", { guesses: [{ pickId: song.pickId, userId: Number(e.target.value) }] })
                    }
                  >
                    <option value="" disabled>
                      Bunu kim seçti?
                    </option>
                    {guess.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nickname}
                      </option>
                    ))}
                  </select>
                  <button
                    className={voted ? "primary" : ""}
                    disabled={busy || voted}
                    onClick={() => send("vote", { pickId: song.pickId })}
                  >
                    {voted ? "♥ Oyun" : "♡ Oy ver"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
