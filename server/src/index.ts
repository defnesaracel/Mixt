import { mkdirSync } from "node:fs";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";

const PORT = Number(process.env.PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? "data/app.db";

mkdirSync("data", { recursive: true });
const app = createApp(openDb(DB_PATH));

app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
