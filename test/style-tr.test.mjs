/**
 * The Turkish style profile. Every dimension here was measured against a
 * four-register Turkish corpus and kept only if it separated registers; five
 * candidates were dropped for moving barely at all between them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { styleProfileTurkish } from "../.test-build/style/tr.js";

const GUIDE =
  "Kuleyi sahil yolundan görebilirsiniz. Vapurdan fotoğrafını çekebilirsiniz.\n" +
  "Akıntıyı da fark edersiniz. Bunu kürekten elinize gelen güçle anlarsınız.\n" +
  "Kanoyla kuleye çıkamazsınız. Rehberli seansımız barınaktan başlıyor.";
const ENCYCLOPEDIC =
  "Kule, Salacak kıyısının açığındaki bir kayanın üzerinde yer almaktadır.\n" +
  "Yapı ilk olarak gümrük ve geçiş noktası işlevi görmüştür.\n" +
  "Sonraki dönemlerde deniz feneri ve karantina yeri olarak kullanılmıştır.";

test("every dimension carries its value, the register norms and a nearest register", () => {
  const p = styleProfileTurkish(GUIDE);
  const expected = [
    "ikinci_kisi_hitabi", "birinci_cogul", "emir_cagri", "dolgu_ifade",
    "cumle_basi_tekrari", "ortalama_cumle_uzunlugu", "ritim_degiskenligi",
  ];
  assert.deepEqual(Object.keys(p.dimensions).sort(), expected.sort());
  for (const [name, d] of Object.entries(p.dimensions)) {
    assert.ok(Number.isFinite(d.value), name);
    assert.deepEqual(Object.keys(d.norms).sort(), ["ansiklopedi", "deneme", "edebiyat", "haber", "pazarlama"]);
    assert.ok(["edebiyat", "haber", "pazarlama", "ansiklopedi", "deneme"].includes(d.closest), name);
  }
});

test("second person address separates a guide from an encyclopedia entry", () => {
  // The strongest dimension in the corpus, at 12.7x between registers.
  const guide = styleProfileTurkish(GUIDE).dimensions.ikinci_kisi_hitabi.value;
  const enc = styleProfileTurkish(ENCYCLOPEDIC).dimensions.ikinci_kisi_hitabi.value;
  assert.ok(guide > enc * 3, `${guide} vs ${enc}`);
});

test("the first person plural counts the -ImIz possessive, not only verbs", () => {
  // "seansımız" is the company speaking; missing it made the dimension read zero
  // on texts that clearly do have a first-person voice.
  const withPossessive = styleProfileTurkish("Rehberli seansımız barınaktan başlıyor.");
  assert.ok(withPossessive.dimensions.birinci_cogul.value > 0);
});

test("no target means no deviation field, a target adds one", () => {
  const plain = styleProfileTurkish(GUIDE);
  assert.equal(plain.target, undefined);
  assert.equal(plain.dimensions.ikinci_kisi_hitabi.deviation, undefined);

  const aimed = styleProfileTurkish(GUIDE, "pazarlama");
  assert.equal(aimed.target, "pazarlama");
  const d = aimed.dimensions.ikinci_kisi_hitabi;
  assert.ok(Number.isFinite(d.deviation));
  assert.ok(Math.abs(d.value - d.norms.pazarlama - d.deviation) < 0.011);
});

test("the profile names a nearest register overall", () => {
  const p = styleProfileTurkish(ENCYCLOPEDIC);
  assert.ok(["edebiyat", "haber", "pazarlama", "ansiklopedi", "deneme"].includes(p.closest_register));
});

test("short text is flagged as unreliable rather than scored silently", () => {
  const p = styleProfileTurkish("Kısa bir metin.");
  assert.ok(p.notes.some((n) => n.includes("kısa")));
});

test("degenerate input stays finite", () => {
  for (const t of ["", "   ", "...", "🙂"]) {
    const p = styleProfileTurkish(t);
    for (const d of Object.values(p.dimensions)) assert.ok(Number.isFinite(d.value), t);
  }
});
