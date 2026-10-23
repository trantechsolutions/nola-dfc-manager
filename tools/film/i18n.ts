// Translation round-trip for game files.
//   npm run film:i18n -- export <slug>   writes private/film/data/i18n/<slug>.todo.json: { "1": "English", ... }
//                                       for every Text whose Spanish is empty (and .paths.json beside it)
//   npm run film:i18n -- import <slug>   reads private/film/data/i18n/<slug>.es.json: { "1": "Español", ... }
//                                       and writes the Spanish into the game file
// Markup (**bold**, *italic*, `mono`) and numbers must be kept as they are.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./common";

const [cmd, slug] = process.argv.slice(2);
if (!["export", "import"].includes(cmd) || !slug) { console.error("usage: npm run film:i18n -- export|import <slug>"); process.exit(1); }
const GAME = join(DATA, "games", `${slug}.json`);
const DIR = join(DATA, "i18n");
mkdirSync(DIR, { recursive: true });
const game = JSON.parse(readFileSync(GAME, "utf8"));

const isText = (v: any) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === "en,es";
function* texts(v: any, path: (string | number)[] = []): Generator<[(string | number)[], { en: string; es: string }]> {
  if (isText(v)) { yield [path, v]; return; }
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* texts(v[i], [...path, i]); return; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) yield* texts(x, [...path, k]);
}
const at = (path: (string | number)[]) => path.reduce((o: any, k) => o[k], game);
const marks = (s: string) => (s.match(/\*\*|`|\d+/g) || []).join(" ");

if (cmd === "export") {
  const todo: Record<number, string> = {}, paths: Record<number, (string | number)[]> = {};
  let n = 0;
  for (const [path, t] of texts(game)) if (!t.es) { n++; todo[n] = t.en; paths[n] = path; }
  writeFileSync(join(DIR, `${slug}.todo.json`), JSON.stringify(todo, null, 1) + "\n");
  writeFileSync(join(DIR, `${slug}.paths.json`), JSON.stringify(paths) + "\n");
  console.log(`${n} strings to translate → private/film/data/i18n/${slug}.todo.json`);
} else {
  const paths = JSON.parse(readFileSync(join(DIR, `${slug}.paths.json`), "utf8"));
  const esFile = join(DIR, `${slug}.es.json`);
  if (!existsSync(esFile)) { console.error(`missing ${esFile}`); process.exit(1); }
  const es = JSON.parse(readFileSync(esFile, "utf8"));
  const missing = Object.keys(paths).filter(k => !es[k]);
  if (missing.length) { console.error(`missing translations: ${missing.join(", ")}`); process.exit(1); }
  const warn: string[] = [];
  for (const [k, path] of Object.entries(paths) as [string, (string | number)[]][]) {
    const t = at(path);
    if (marks(t.en) !== marks(es[k])) warn.push(`#${k} markup or numbers differ:\n    en: ${t.en}\n    es: ${es[k]}`);
    t.es = es[k];
  }
  writeFileSync(GAME, JSON.stringify(game, null, 2) + "\n");
  console.log(`imported ${Object.keys(paths).length} translations into ${slug}.json`);
  if (warn.length) console.warn(warn.join("\n"));
}
