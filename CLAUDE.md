# CLAUDE.md

- Read `SPEC.md` first. It is the single source of truth; don't add features outside it without asking.
- Reply to the user in English. App UI text stays Turkish.
- Stack: `client/` Vite + React + TS, `server/` Express + TS on Node 24+ (built-in `node:sqlite`, `.ts` run directly, so use erasable TS syntax and `.ts` import extensions in server).
- Before every commit: `npm test` and `npm run typecheck` must pass. One commit per build step, update README progress.
- Keep it small: prototype, mobile-first, no needless abstraction.
