/**
 * The empty stand-in for the generated Turkish lexicon. `npm run ensure:lexicon`
 * copies this over `tr-lexicon.generated.ts` when that file is missing, so the
 * build works in a fresh clone; `npm run build:lexicon` replaces it with the
 * real thing from a local dictionary.
 *
 * The generated file is gitignored: no dictionary content belongs in the
 * repository. With the stub in place the rules that need a lexicon report
 * themselves in `skipped_rules` instead of silently passing.
 */
export const TR_LEXICON: ReadonlySet<string> = new Set<string>([]);
