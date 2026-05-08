0. Follow `.editorconfig`: UTF-8, LF endings, final newline, spaces, 2-space indentation except Python at 4 spaces. TypeScript is strict via `tsconfig.base.json`; use PascalCase components, `useSomething` hooks, and camelCase utilities. Python targets 3.11, Ruff line length is 100, and mypy is strict. Never edit generated schema outputs by hand; update `project.schema.json` and regenerate.
1. **Never silently delete or overwrite the user's files.** This includes `.gitignore`d files, project folders, and existing code. If something is in the way, ask via a clarifying note in `STATE.md`'s "Blocked" section and stop.
2. **Never commit secrets** (API keys, tokens, `.env` files). The repo's `.gitignore` blocks `.env*` — do not weaken it.
3. **Always run all verification commands** for the task, not just the first one.
4. **One task per commit.** Atomic, revertable history.
5. **When you are in the development, invoke the `test-driven-development` skill, [frontend](../../apps/web) related code also should invoke `next-best-practices` skill, [backend](../../apps/server) related code also should invoke `fastapi-python` skill**
6. **For Database develop, invoking the `sqlite-database-expert` skill**
7. **Highly replicate the fidelity of the visual presented by the prototype `docs/prototype/v1`**, the URL is http://192.168.31.48/app.html, shouldn't copy the css code from it, **implement them with tailwind css and must not let the `suggestCanonicalClasses` tip of tailwind appears**
8. **Never using a raw function multiple time, instead, encapsulating them**, for example: for `fetch` function, you should encapsulate a global request function for global usage. Other raw functions are similar, like time formatting, color handling, local storage methods, dom manipulation and so on.
9. **global components - the atomic blocks accross multiple interface sections**
10. **Access any text via `useTranslations()` from `next-intl`**, using `zh.json` and `en.json` seperately, the default is `en`, don't mix the English text with Chinese text.

