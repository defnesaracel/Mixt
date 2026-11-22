import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { promptForDate, todayInIstanbul } from "./prompts.ts";
import { getSong, searchSongs } from "./songs.ts";

// Karıştırılması kolay karakterler (0/O, 1/I) çıkarıldı.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_NICKNAME = 24;

type User = { id: number; nickname: string; group_id: number; is_admin: number };

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

function makeInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  if (nickname.length === 0 || nickname.length > MAX_NICKNAME) return null;
  return nickname;
}

type Round = { id: number; group_id: number; date: string; prompt: string; phase: Phase };
type Phase = "pick" | "guess" | "result";

export function createApp(db: DatabaseSync, options: { today?: () => string } = {}) {
  const today = options.today ?? (() => todayInIstanbul());
  const app = express();
  app.use(express.json());

  function createUser(nickname: string, groupId: number, isAdmin: boolean) {
    const token = randomBytes(24).toString("hex");
    const result = db
      .prepare("INSERT INTO users (nickname, group_id, is_admin, token) VALUES (?, ?, ?, ?)")
      .run(nickname, groupId, isAdmin ? 1 : 0, token);
    return { userId: Number(result.lastInsertRowid), token };
  }

  function groupInfo(groupId: number) {
    const group = db
      .prepare("SELECT id, name, invite_code AS inviteCode FROM groups WHERE id = ?")
      .get(groupId);
    const members = db
      .prepare("SELECT id, nickname, is_admin AS isAdmin FROM users WHERE group_id = ? ORDER BY id")
      .all(groupId)
      .map((m) => ({ ...m, isAdmin: m.isAdmin === 1 }));
    return { ...group, members };
  }

  function requireUser(req: Request, res: Response, next: NextFunction) {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const user = token
      ? (db
          .prepare("SELECT id, nickname, group_id, is_admin FROM users WHERE token = ?")
          .get(token) as User | undefined)
      : undefined;
    if (!user) {
      res.status(401).json({ error: "Oturum bulunamadı" });
      return;
    }
    req.user = user;
    next();
  }

  app.post("/api/groups", (req, res) => {
    const nickname = cleanNickname(req.body?.nickname);
    if (!nickname) {
      res.status(400).json({ error: `Takma ad 1-${MAX_NICKNAME} karakter olmalı` });
      return;
    }
    const groupName =
      typeof req.body?.groupName === "string" && req.body.groupName.trim()
        ? req.body.groupName.trim().slice(0, 40)
        : "Grubumuz";

    let groupId = 0;
    for (let attempt = 0; attempt < 5 && !groupId; attempt++) {
      try {
        const result = db
          .prepare("INSERT INTO groups (name, invite_code) VALUES (?, ?)")
          .run(groupName, makeInviteCode());
        groupId = Number(result.lastInsertRowid);
      } catch {
        // davet kodu çakıştı, yeniden dene
      }
    }
    if (!groupId) {
      res.status(500).json({ error: "Grup oluşturulamadı" });
      return;
    }

    const { userId, token } = createUser(nickname, groupId, true);
    res.status(201).json({ token, userId, group: groupInfo(groupId) });
  });

  app.post("/api/groups/join", (req, res) => {
    const nickname = cleanNickname(req.body?.nickname);
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!nickname) {
      res.status(400).json({ error: `Takma ad 1-${MAX_NICKNAME} karakter olmalı` });
      return;
    }
    const group = db.prepare("SELECT id FROM groups WHERE invite_code = ?").get(code) as
      | { id: number }
      | undefined;
    if (!group) {
      res.status(404).json({ error: "Bu davet kodunda grup yok" });
      return;
    }
    const taken = db
      .prepare("SELECT 1 FROM users WHERE group_id = ? AND lower(nickname) = lower(?)")
      .get(group.id, nickname);
    if (taken) {
      res.status(409).json({ error: "Bu takma ad grupta zaten var" });
      return;
    }

    const { userId, token } = createUser(nickname, group.id, false);
    res.status(201).json({ token, userId, group: groupInfo(group.id) });
  });

  app.get("/api/me", requireUser, (req, res) => {
    const user = req.user!;
    res.json({
      userId: user.id,
      nickname: user.nickname,
      isAdmin: user.is_admin === 1,
      group: groupInfo(user.group_id),
    });
  });

  function getOrCreateTodayRound(groupId: number): Round {
    const date = today();
    db.prepare("INSERT OR IGNORE INTO rounds (group_id, date, prompt) VALUES (?, ?, ?)").run(
      groupId,
      date,
      promptForDate(date),
    );
    return db
      .prepare("SELECT id, group_id, date, prompt, phase FROM rounds WHERE group_id = ? AND date = ?")
      .get(groupId, date) as Round;
  }

  // Turun kullanıcının grubuna ait olduğunu kontrol eder.
  function findRoundForUser(req: Request, res: Response): Round | undefined {
    const round = db
      .prepare("SELECT id, group_id, date, prompt, phase FROM rounds WHERE id = ?")
      .get(Number(req.params.id)) as Round | undefined;
    if (!round || round.group_id !== req.user!.group_id) {
      res.status(404).json({ error: "Tur bulunamadı" });
      return undefined;
    }
    return round;
  }

  type PickRow = { id: number; user_id: number; title: string; artist: string; cover_url: string | null };

  function roundPicks(roundId: number): PickRow[] {
    return db
      .prepare("SELECT id, user_id, title, artist, cover_url FROM picks WHERE round_id = ?")
      .all(roundId) as PickRow[];
  }

  function memberIds(groupId: number): number[] {
    return (db.prepare("SELECT id FROM users WHERE group_id = ?").all(groupId) as { id: number }[]).map(
      (m) => m.id,
    );
  }

  // Bir kişi, kendi şarkısı dışındaki her şarkı için tahmin yapıp (oy verilebilecek şarkı varsa) oy verince bitirmiş sayılır.
  function finishedGuessing(round: Round, userId: number, picks: PickRow[]): boolean {
    const othersPicks = picks.filter((p) => p.user_id !== userId);
    const guessCount = (
      db
        .prepare("SELECT count(*) AS n FROM guesses WHERE round_id = ? AND guesser_id = ?")
        .get(round.id, userId) as { n: number }
    ).n;
    const voted = db.prepare("SELECT 1 FROM votes WHERE round_id = ? AND voter_id = ?").get(round.id, userId);
    return guessCount >= othersPicks.length && (othersPicks.length === 0 || voted !== undefined);
  }

  function setPhase(round: Round, phase: Phase) {
    db.prepare("UPDATE rounds SET phase = ? WHERE id = ?").run(phase, round.id);
    round.phase = phase;
  }

  function advanceIfEveryonePicked(round: Round) {
    const members = memberIds(round.group_id);
    if (round.phase === "pick" && roundPicks(round.id).length >= members.length) setPhase(round, "guess");
  }

  function advanceIfEveryoneFinished(round: Round) {
    if (round.phase !== "guess") return;
    const picks = roundPicks(round.id);
    if (memberIds(round.group_id).every((id) => finishedGuessing(round, id, picks))) setPhase(round, "result");
  }

  // Her turda sabit ama karışık bir sıra: herkes aynı sırayı görür ve sayfa yenilenince değişmez.
  function shuffleKey(roundId: number, pickId: number): string {
    return createHash("sha1").update(`${roundId}:${pickId}`).digest("hex");
  }

  function guessPhaseData(round: Round, userId: number) {
    const picks = roundPicks(round.id).sort((a, b) =>
      shuffleKey(round.id, a.id).localeCompare(shuffleKey(round.id, b.id)),
    );
    const pickerIds = new Set(picks.map((p) => p.user_id));
    const candidates = (
      db
        .prepare("SELECT id, nickname FROM users WHERE group_id = ? ORDER BY nickname")
        .all(round.group_id) as { id: number; nickname: string }[]
    ).filter((m) => m.id !== userId && pickerIds.has(m.id));

    const myGuesses = Object.fromEntries(
      (
        db
          .prepare("SELECT pick_id, guessed_user_id FROM guesses WHERE round_id = ? AND guesser_id = ?")
          .all(round.id, userId) as { pick_id: number; guessed_user_id: number }[]
      ).map((g) => [g.pick_id, g.guessed_user_id]),
    );
    const myVote =
      (
        db.prepare("SELECT pick_id FROM votes WHERE round_id = ? AND voter_id = ?").get(round.id, userId) as
          | { pick_id: number }
          | undefined
      )?.pick_id ?? null;

    const members = memberIds(round.group_id);
    return {
      songs: picks.map((p) => ({
        pickId: p.id,
        title: p.title,
        artist: p.artist,
        coverUrl: p.cover_url,
        isMine: p.user_id === userId,
      })),
      candidates,
      myGuesses,
      myVote,
      finishedCount: members.filter((id) => finishedGuessing(round, id, picks)).length,
    };
  }

  app.get("/api/rounds/today", requireUser, (req, res) => {
    const user = req.user!;
    const round = getOrCreateTodayRound(user.group_id);
    const memberCount = memberIds(user.group_id).length;
    const pickedCount = roundPicks(round.id).length;
    const myPick =
      db
        .prepare("SELECT title, artist, cover_url AS coverUrl FROM picks WHERE round_id = ? AND user_id = ?")
        .get(round.id, user.id) ?? null;

    res.json({
      round: { id: round.id, date: round.date, prompt: round.prompt, phase: round.phase },
      memberCount,
      pickedCount,
      myPick,
      guess: round.phase === "guess" ? guessPhaseData(round, user.id) : null,
    });
  });

  app.post("/api/rounds/:id/guess", requireUser, (req, res) => {
    const round = findRoundForUser(req, res);
    if (!round) return;
    if (round.phase !== "guess") {
      res.status(409).json({ error: "Şu an tahmin aşaması değil" });
      return;
    }
    const input = req.body?.guesses;
    if (!Array.isArray(input) || input.length === 0) {
      res.status(400).json({ error: "Tahmin listesi boş" });
      return;
    }
    const userId = req.user!.id;
    const picks = new Map(roundPicks(round.id).map((p) => [p.id, p]));
    const pickers = new Set([...picks.values()].map((p) => p.user_id));

    for (const guess of input) {
      const pick = picks.get(Number(guess?.pickId));
      const guessedUserId = Number(guess?.userId);
      if (!pick) {
        res.status(400).json({ error: "Şarkı bu turda yok" });
        return;
      }
      if (pick.user_id === userId) {
        res.status(400).json({ error: "Kendi şarkın için tahmin yapılmaz" });
        return;
      }
      if (guessedUserId === userId || !pickers.has(guessedUserId)) {
        res.status(400).json({ error: "Geçersiz kişi" });
        return;
      }
    }

    const upsert = db.prepare(
      `INSERT INTO guesses (round_id, guesser_id, pick_id, guessed_user_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (round_id, guesser_id, pick_id) DO UPDATE SET guessed_user_id = excluded.guessed_user_id`,
    );
    for (const guess of input) upsert.run(round.id, userId, Number(guess.pickId), Number(guess.userId));

    advanceIfEveryoneFinished(round);
    res.json({ ok: true, phase: round.phase });
  });

  app.post("/api/rounds/:id/vote", requireUser, (req, res) => {
    const round = findRoundForUser(req, res);
    if (!round) return;
    if (round.phase !== "guess") {
      res.status(409).json({ error: "Şu an oylama aşaması değil" });
      return;
    }
    const pick = roundPicks(round.id).find((p) => p.id === Number(req.body?.pickId));
    if (!pick) {
      res.status(400).json({ error: "Şarkı bu turda yok" });
      return;
    }
    if (pick.user_id === req.user!.id) {
      res.status(400).json({ error: "Kendi şarkına oy veremezsin" });
      return;
    }
    db.prepare(
      `INSERT INTO votes (round_id, voter_id, pick_id) VALUES (?, ?, ?)
       ON CONFLICT (round_id, voter_id) DO UPDATE SET pick_id = excluded.pick_id`,
    ).run(round.id, req.user!.id, pick.id);

    advanceIfEveryoneFinished(round);
    res.json({ ok: true, phase: round.phase });
  });

  app.get("/api/songs/search", requireUser, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json({ songs: await searchSongs(q) });
  });

  app.post("/api/rounds/:id/pick", requireUser, async (req, res) => {
    const round = findRoundForUser(req, res);
    if (!round) return;
    if (round.phase !== "pick") {
      res.status(409).json({ error: "Seçim aşaması bitti" });
      return;
    }
    const song = await getSong(String(req.body?.songId ?? ""));
    if (!song) {
      res.status(400).json({ error: "Şarkı bulunamadı" });
      return;
    }
    db.prepare(
      `INSERT INTO picks (round_id, user_id, title, artist, cover_url) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (round_id, user_id) DO UPDATE SET
         title = excluded.title, artist = excluded.artist, cover_url = excluded.cover_url,
         created_at = datetime('now')`,
    ).run(round.id, req.user!.id, song.title, song.artist, song.coverUrl);
    advanceIfEveryonePicked(round);
    res.json({ ok: true, phase: round.phase });
  });

  return app;
}
