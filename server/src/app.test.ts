import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";

async function startServer() {
  const server = createApp(openDb(":memory:")).listen(0);
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
