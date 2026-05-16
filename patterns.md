1. Follow `.editorconfig`: UTF-8, LF endings, final newline, spaces, 2-space indentation except Python at 4 spaces. TypeScript is strict via `tsconfig.base.json`; 
2. **Never commit secrets** (API keys, tokens, `.env` files). The repo's `.gitignore` blocks `.env*` — do not weaken it.
3. **Always run all verification commands** for the task, not just the first one.
4. **One task per commit.** Atomic, revertable history.
5. **When you are in the development, invoke the `test-driven-development` skill, [frontend](../../apps/web) related code also should invoke `next-best-practices` skill, [backend](../../apps/server) related code also should invoke `fastapi-python` skill**
6. **If found pre-existing issues, recording them at [spec](./docs/designs/SPEC.md#pre-existing-issues), don't just skip them**
7. **Highly replicate the fidelity of the visual presented by the prototype `docs/prototype`**, the URL is http://192.168.31.48/app.html, must not copy the css code from it, **implement them with tailwind css and must not let the `suggestCanonicalClasses` tip of tailwind appears, using Context7 MCP get the latest syntax of tailwindcss**
