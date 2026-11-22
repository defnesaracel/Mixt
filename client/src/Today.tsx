import { useEffect, useState } from "react";
import { api } from "./api";
import type { GuessData, Phase, ResultData, Song, TodayData } from "./api";

const REFRESH_MS = 5000;

export function Today({ isAdmin }: { isAdmin: boolean }) {
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
      {data.round.phase === "result" && data.result && <ResultPhase result={data.result} />}
      {error && <p className="error">{error}</p>}
      {isAdmin && data.round.phase !== "result" && (
        <AdminAdvance roundId={data.round.id} phase={data.round.phase} onAdvanced={load} />
      )}
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

function ResultPhase({ result }: { result: ResultData }) {
  const winners = result.songs.filter((s) => s.isWinner);
  const rest = result.songs.filter((s) => !s.isWinner);

  return (
    <>
      <div className="card winner">
        <p className="muted">{winners.length > 1 ? "Günün şarkıları (berabere)" : "Günün şarkısı"}</p>
        {winners.length === 0 && <p>Kimse oy vermedi, bugün kazanan yok.</p>}
        {winners.map((song) => (
          <div key={song.pickId} className="stack-sm">
            <SongRow title={song.title} artist={song.artist} />
            <p>
              <strong>{song.pickedBy}</strong> seçti · {song.votes} oy
            </p>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <h3>Diğer şarkılar</h3>
          <ul className="song-list">
            {rest.map((song) => (
              <li key={song.pickId} className="card">
                <SongRow title={song.title} artist={song.artist} />
                <p>
                  <strong>{song.pickedBy}</strong> seçti · {song.votes} oy
                </p>
                <GuessNote song={song} />
              </li>
            ))}
          </ul>
        </>
      )}

      {winners.some((s) => s.myGuess !== null) && (
        <div className="card">
          <p className="muted">Kazanan için tahminin</p>
          {winners.map((s) => (
            <GuessNote key={s.pickId} song={s} />
          ))}
        </div>
      )}

      <h3>Kimin tahmini tuttu?</h3>
      <div className="card">
        {result.guessers.length === 0 && <p className="muted">Kimse tahmin yapmadı.</p>}
        <ul className="plain">
          {result.guessers.map((g) => (
            <li key={g.nickname}>
              <strong>{g.nickname}</strong>: {g.correct}/{g.total} doğru
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function GuessNote({ song }: { song: ResultData["songs"][number] }) {
  if (song.isMine) return <p className="muted">Senin seçimin</p>;
  if (song.myGuess === null) return <p className="muted">Tahmin etmedin</p>;
  return (
    <p className={song.myGuessCorrect ? "correct" : "wrong"}>
      {song.myGuessCorrect ? "✓" : "✗"} Tahminin: {song.myGuess}
    </p>
  );
}

const NEXT_PHASE_LABEL: Record<Exclude<Phase, "result">, string> = {
  pick: "Tahmin aşamasına geç",
  guess: "Sonuçları aç",
};

function AdminAdvance({
  roundId,
  phase,
  onAdvanced,
}: {
  roundId: number;
  phase: Exclude<Phase, "result">;
  onAdvanced: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function advance() {
    if (!confirm(`${NEXT_PHASE_LABEL[phase]}? Bitirmeyenler bekletilmeden geçilir.`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/rounds/${roundId}/advance`, {});
      await onAdvanced();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card admin">
      <p className="muted">Yönetici</p>
      <button onClick={advance} disabled={busy}>
        {NEXT_PHASE_LABEL[phase]} →
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
