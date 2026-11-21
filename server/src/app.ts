import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

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

export function createApp(db: DatabaseSync) {
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

  return app;
}
