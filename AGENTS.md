# AGENTS.md

## Cursor Cloud specific instructions

### Repository state on this branch

This branch (`cursor/moscow-survival-mechanics-2b9f`) is **documentation-only**. It
contains a Russian-language game design document (GDD) and nothing else:

- `docs/moscow-survival-mechanics.md` — the GDD for *«Выживание в Москве»* (Moscow
  Survival): three body-driven survival mechanics.
- `README.md` — placeholder (`# cursor`).

There is **no application code, `package.json`, build system, or automated test
suite** on this branch. "Development" here means editing and reviewing the GDD.
The playable game (PAUTINA, a browser Canvas game) lives on a *different* branch
(`cursor/web-swing-gravity-game-2b9f`); do not expect it to be present here.

Toolchain already available on the VM: Node.js 22 and Python 3.12 (no version
manager pinning needed).

### Lint the docs

```bash
npx --yes markdownlint-cli2 "docs/**/*.md" "README.md"
```

`markdownlint` self-fetches via `npx`, so no install step is required. Note: with
its default ruleset it flags cosmetic nits on this GDD that are intentional and
should **not** be "fixed" without a real reason — `MD013` (prose wraps slightly
past 80 chars) and `MD024` (each mechanic section reuses headings like `Суть` /
`Влияние на геймплей` / `Связи с другими системами`).

### Preview the rendered GDD

The GDD is Cyrillic and table-heavy, so a rendered preview is the most useful way
to review it. `python -m markdown` (installed by the update script) renders it
offline with no network/GitHub dependency:

```bash
mkdir -p /tmp/gdd_preview
python3 -c "import markdown,pathlib; pathlib.Path('/tmp/gdd_preview/index.html').write_text('<meta charset=utf-8>'+markdown.markdown(pathlib.Path('docs/moscow-survival-mechanics.md').read_text('utf-8'),extensions=['tables','toc','fenced_code']),'utf-8')"
python3 -m http.server 8000 --directory /tmp/gdd_preview
```

Then open `http://localhost:8000/`. Render into a scratch dir (e.g. `/tmp`) so the
generated HTML never lands in the repo working tree.
