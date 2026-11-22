import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";

async function startServer(today = () => "2026-11-21") {
  const db = openDb(":memory:");
  const server = createApp(db, { today }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  return {
    call,
    db,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

test("grup kurma, katılma ve oturum", async () => {
  const { call, close } = await startServer();
  try {
    const created = await call("/api/groups", { nickname: "Defne" });
    assert.equal(created.status, 201);
    assert.match(created.data.group.inviteCode, /^[A-Z0-9]{6}$/);
    assert.equal(created.data.group.members[0].isAdmin, true);

    const code = created.data.group.inviteCode.toLowerCase();
    const joined = await call("/api/groups/join", { code, nickname: "Ali" });
    assert.equal(joined.status, 201);
    assert.equal(joined.data.group.members.length, 2);

    const duplicate = await call("/api/groups/join", { code, nickname: "ali" });
    assert.equal(duplicate.status, 409);

    const wrongCode = await call("/api/groups/join", { code: "XXXXXX", nickname: "Can" });
    assert.equal(wrongCode.status, 404);

    const emptyName = await call("/api/groups", { nickname: "   " });
    assert.equal(emptyName.status, 400);

    const me = await call("/api/me", undefined, joined.data.token);
    assert.equal(me.status, 200);
    assert.equal(me.data.nickname, "Ali");
    assert.equal(me.data.isAdmin, false);

    const noToken = await call("/api/me");
    assert.equal(noToken.status, 401);
  } finally {
    close();
  }
});

test("bugünün turu, şarkı arama ve seçim", async () => {
  let date = "2026-11-21";
  const { call, db, close } = await startServer(() => date);
  try {
    const admin = await call("/api/groups", { nickname: "Defne" });
    const code = admin.data.group.inviteCode;
    const ali = await call("/api/groups/join", { code, nickname: "Ali" });
    const other = await call("/api/groups", { nickname: "Başkası" });

    const today = await call("/api/rounds/today", undefined, admin.data.token);
    assert.equal(today.status, 200);
    assert.equal(today.data.round.phase, "pick");
    assert.equal(today.data.round.date, "2026-11-21");
    assert.ok(today.data.round.prompt.length > 0);
    assert.equal(today.data.memberCount, 2);
    assert.equal(today.data.pickedCount, 0);
    assert.equal(today.data.myPick, null);
    const roundId = today.data.round.id;

    // Aynı grupta aynı gün tek tur olur.
    const again = await call("/api/rounds/today", undefined, ali.data.token);
    assert.equal(again.data.round.id, roundId);

    // Türkçe karakterden bağımsız arama.
    const search = await call("/api/songs/search?q=cay bahcesi", undefined, ali.data.token);
    assert.equal(search.data.songs[0].title, "Çay Bahçesi");

    const pick = await call(`/api/rounds/${roundId}/pick`, { songId: "f01" }, admin.data.token);
    assert.equal(pick.status, 200);
    // Seçim değiştirilebilir, satır sayısı artmaz.
    await call(`/api/rounds/${roundId}/pick`, { songId: "f02" }, admin.data.token);
    const mid = await call("/api/rounds/today", undefined, admin.data.token);
    assert.equal(mid.data.pickedCount, 1);
    assert.equal(mid.data.myPick.title, "Kahve ve Yağmur");

    const badSong = await call(`/api/rounds/${roundId}/pick`, { songId: "yok" }, admin.data.token);
    assert.equal(badSong.status, 400);

    const otherGroup = await call(`/api/rounds/${roundId}/pick`, { songId: "f01" }, other.data.token);
    assert.equal(otherGroup.status, 404);

    // İki kişi aynı şarkıyı seçebilir. Herkes seçince tur kendiliğinden tahmin aşamasına geçer.
    const last = await call(`/api/rounds/${roundId}/pick`, { songId: "f02" }, ali.data.token);
    assert.equal(last.data.phase, "guess");
    assert.equal(
      (db.prepare("SELECT count(*) AS n FROM picks WHERE round_id = ?").get(roundId) as { n: number }).n,
      2,
    );

    const tooLate = await call(`/api/rounds/${roundId}/pick`, { songId: "f03" }, admin.data.token);
    assert.equal(tooLate.status, 409);

    // Ertesi gün yeni tur ve farklı soru.
    date = "2026-11-22";
    const tomorrow = await call("/api/rounds/today", undefined, admin.data.token);
    assert.notEqual(tomorrow.data.round.id, roundId);
    assert.notEqual(tomorrow.data.round.prompt, today.data.round.prompt);
    assert.equal(tomorrow.data.round.phase, "pick");
  } finally {
    close();
  }
});

test("tahmin ve oy aşaması", async () => {
  const { call, close } = await startServer();
  try {
    const a = await call("/api/groups", { nickname: "Ayşe" });
    const code = a.data.group.inviteCode;
    const b = await call("/api/groups/join", { code, nickname: "Bora" });
    const c = await call("/api/groups/join", { code, nickname: "Cem" });
    const ids = { a: a.data.userId, b: b.data.userId, c: c.data.userId };
    const tokens = { a: a.data.token, b: b.data.token, c: c.data.token };

    const roundId = (await call("/api/rounds/today", undefined, tokens.a)).data.round.id;
    const url = (action: string) => `/api/rounds/${roundId}/${action}`;

    // Seçim bitmeden tahmin yapılamaz.
    const early = await call(url("vote"), { pickId: 1 }, tokens.a);
    assert.equal(early.status, 409);

    await call(url("pick"), { songId: "f01" }, tokens.a);
    await call(url("pick"), { songId: "f02" }, tokens.b);
    await call(url("pick"), { songId: "f02" }, tokens.c);

    const viewA = (await call("/api/rounds/today", undefined, tokens.a)).data;
    assert.equal(viewA.round.phase, "guess");
    assert.equal(viewA.guess.songs.length, 3);
    // Şarkılar isimsiz gelir.
    assert.ok(viewA.guess.songs.every((s: object) => !("userId" in s) && !("nickname" in s)));
    assert.equal(viewA.guess.songs.filter((s: { isMine: boolean }) => s.isMine).length, 1);
    // Kendisi aday listesinde yok.
    assert.deepEqual(
      viewA.guess.candidates.map((m: { id: number }) => m.id).sort(),
      [ids.b, ids.c].sort(),
    );
    // Herkes aynı sırayı görür.
    const viewB = (await call("/api/rounds/today", undefined, tokens.b)).data;
    assert.deepEqual(
      viewB.guess.songs.map((s: { pickId: number }) => s.pickId),
      viewA.guess.songs.map((s: { pickId: number }) => s.pickId),
    );

    // Her kullanıcının kendi şarkısının pickId'si (isMine ile).
    const myPickId = async (token: string) =>
      (await call("/api/rounds/today", undefined, token)).data.guess.songs.find(
        (s: { isMine: boolean }) => s.isMine,
      ).pickId;
    const pickOf = { a: await myPickId(tokens.a), b: await myPickId(tokens.b), c: await myPickId(tokens.c) };

    // Kurallar.
    const ownVote = await call(url("vote"), { pickId: pickOf.a }, tokens.a);
    assert.equal(ownVote.status, 400);
    const ownGuess = await call(url("guess"), { guesses: [{ pickId: pickOf.a, userId: ids.b }] }, tokens.a);
    assert.equal(ownGuess.status, 400);
    const selfAsAnswer = await call(url("guess"), { guesses: [{ pickId: pickOf.b, userId: ids.a }] }, tokens.a);
    assert.equal(selfAsAnswer.status, 400);

    // Ayşe: ikisini de doğru tahmin eder, Bora'ya oy verir. Önce yanlış oy, sonra değiştirir.
    await call(url("guess"), { guesses: [{ pickId: pickOf.b, userId: ids.b }, { pickId: pickOf.c, userId: ids.c }] }, tokens.a);
    await call(url("vote"), { pickId: pickOf.c }, tokens.a);
    const changed = await call(url("vote"), { pickId: pickOf.b }, tokens.a);
    assert.equal(changed.data.phase, "guess");

    const progress = (await call("/api/rounds/today", undefined, tokens.b)).data.guess;
    assert.equal(progress.finishedCount, 1);

    // Bora ve Cem bitirir; son kişi bitirince sonuç aşamasına geçilir.
    await call(url("guess"), { guesses: [{ pickId: pickOf.a, userId: ids.c }, { pickId: pickOf.c, userId: ids.a }] }, tokens.b);
    await call(url("vote"), { pickId: pickOf.a }, tokens.b);
    await call(url("guess"), { guesses: [{ pickId: pickOf.a, userId: ids.a }, { pickId: pickOf.b, userId: ids.b }] }, tokens.c);
    const lastStep = await call(url("vote"), { pickId: pickOf.b }, tokens.c);
    assert.equal(lastStep.data.phase, "result");

    const closed = await call(url("vote"), { pickId: pickOf.c }, tokens.a);
    assert.equal(closed.status, 409);
  } finally {
    close();
  }
});
