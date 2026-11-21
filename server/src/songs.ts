import { readFileSync } from "node:fs";

export type Song = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  previewUrl?: string;
};

// Tek şarkı kaynağı. Gerçek API'ye (Deezer/iTunes) geçerken sadece bu dosya değişir.
const catalog: Song[] = (
  JSON.parse(
    readFileSync(new URL("../data/fakeSongs.json", import.meta.url), "utf8"),
  ) as { id: string; title: string; artist: string }[]
).map((song) => ({ ...song, coverUrl: null }));

function normalize(text: string): string {
  return text.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
}

export async function searchSongs(query: string): Promise<Song[]> {
  const q = normalize(query.trim());
  if (!q) return catalog.slice(0, 10);
  return catalog
    .filter((song) => normalize(`${song.title} ${song.artist}`).includes(q))
    .slice(0, 20);
}

export async function getSong(id: string): Promise<Song | undefined> {
  return catalog.find((song) => song.id === id);
}
