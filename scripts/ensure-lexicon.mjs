/** Puts the empty stub in place when no generated lexicon exists, so a fresh
 *  clone builds. Never overwrites a real one. */
import { copyFileSync, existsSync } from "node:fs";
const target = "src/grammar/tr-lexicon.generated.ts";
if (!existsSync(target)) {
  copyFileSync("src/grammar/tr-lexicon.stub.ts", target);
  console.log(`${target} yok — boş stub kopyalandı.`);
}
