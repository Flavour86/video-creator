import { PageChrome } from "@/components/app-shell/PageChrome";

const tokenGroups = ["Colors", "Typography", "Space", "Cinema"] as const;

export default function TokensPage() {
  return (
    <PageChrome>
      <header className="grid gap-(--space-2)">
        <p className="vc-type-eyebrow text-(--text-3)">Design Tokens</p>
        <h1 className="vc-type-h1 text-(--text)">Tokens</h1>
      </header>

      <section className="grid gap-(--space-4) md:grid-cols-2 xl:grid-cols-4">
        {tokenGroups.map((group) => (
          <article className="rounded-(--r) border border-(--line) bg-(--bg-1) p-(--space-5)" key={group}>
            <h2 className="vc-type-section text-(--text)">{group}</h2>
          </article>
        ))}
      </section>
    </PageChrome>
  );
}
