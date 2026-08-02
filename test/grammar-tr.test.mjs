/**
 * Turkish orthography rules. Every rule here was measured against the 42,449
 * attested sentences in the TDK dictionary's example corpus — text that is
 * correct by definition — and only rules under a 0.5% false-positive rate were
 * kept. `npm run benchmark:grammar` re-runs that measurement.
 *
 * The lexicon is generated from a local dictionary and is not in the repository,
 * so the rules that need it are skipped when it is absent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkTurkish } from "../.test-build/grammar/tr.js";

const withLexicon = checkTurkish("deneme").lexicon_available;
const rules = (t) => new Set(checkTurkish(t).findings.map((f) => f.rule));

test("mixed apostrophe characters are reported", () => {
  // Needs no lexicon: it is a consistency check over the whole document.
  assert.ok(rules("Kız Kulesi'ni gördük. Hero’ya ulaştı.").has("kesme_isareti_tutarsiz"));
  assert.ok(!rules("Kız Kulesi'ni gördük. Hero'ya ulaştı.").has("kesme_isareti_tutarsiz"));
  assert.ok(!rules("Kız Kulesi’ni gördük. Hero’ya ulaştı.").has("kesme_isareti_tutarsiz"));
});

test("the apostrophe rule works without the lexicon", () => {
  const r = checkTurkish("Kız Kulesi'ni gördük. Hero’ya ulaştı.");
  assert.ok(r.checked_rules.includes("kesme_isareti_tutarsiz"));
  assert.equal(r.findings.length, 1);
});

test("a missing lexicon is reported rather than silently ignored", () => {
  const r = checkTurkish("Kitapları okudum.");
  assert.equal(typeof r.lexicon_available, "boolean");
  if (!r.lexicon_available) {
    assert.deepEqual(r.checked_rules, ["kesme_isareti_tutarsiz"]);
    assert.ok(r.skipped_rules.length > 0);
  } else {
    assert.equal(r.skipped_rules.length, 0);
  }
});

test("correct Turkish produces no findings", { skip: !withLexicon }, () => {
  for (const s of [
    "Kitapları okudum ve defterleri masaya koydum.",
    "Öğrenciler sınıflarda sessizce beklediler.",
    "Sanki hiçbir şey olmamış gibi davrandı.",
    "Belki yarın gelir, belki gelmez.",
    "Evdeki hesap çarşıya uymadı.",
  ]) {
    assert.deepEqual(checkTurkish(s).findings, [], s);
  }
});

test("a suffix that breaks vowel harmony is caught", { skip: !withLexicon }, () => {
  const r = checkTurkish("Kitapler okudum.");
  const f = r.findings.find((x) => x.rule === "ek_uyumu");
  assert.ok(f, "harmony violation not reported");
  assert.match(f.suggestion ?? "", /kitaplar/);
});

test("loanword stems do not trigger the harmony rule", { skip: !withLexicon }, () => {
  // "kitap" and "kalem" break harmony inside the word but their suffixes agree
  // with the final vowel, which is all the rule looks at.
  for (const s of ["Kitaplar masada duruyor.", "Kalemler kutuda."]) {
    assert.equal(checkTurkish(s).findings.length, 0, s);
  }
});

test("a joined conjunction 'ki' is caught, a relative suffix is not", { skip: !withLexicon }, () => {
  assert.ok(rules("Öyle bir yerki anlatamam.").has("baglac_ki_bitisik"));
  assert.ok(rules("Demekki olmuyor.").has("baglac_ki_bitisik"));
  // Single dictionary words, and the relative suffix after a locative or a time
  // word — all correct, none may be flagged.
  for (const s of [
    "Sanki yağmur yağacak.", "Belki gelir.", "Yarınki toplantı önemli.",
    "Bir zamanki gibi değil.", "Masadaki kitabı aldım.", "Oradaki adamı gördüm.",
  ]) {
    assert.ok(!rules(s).has("baglac_ki_bitisik"), s);
  }
});

test("the da/de rule is deliberately absent", { skip: !withLexicon }, () => {
  // Morphology cannot separate the locative from the conjunction, so the rule
  // is not shipped. These correct locatives must stay clean.
  for (const s of ["Evinde rahat rahat oturuyordu.", "Ortada bir sorun yok.", "Bir iskemlede oturdu."]) {
    assert.deepEqual(checkTurkish(s).findings, [], s);
  }
});

test("the score falls as findings accumulate", { skip: !withLexicon }, () => {
  const clean = checkTurkish("Kitapları okudum. Defterleri getirdim. Öğrenciler geldi.");
  const dirty = checkTurkish("Kitapler okudum. Defterlar getirdim. Öğrencilar geldi.");
  assert.equal(clean.score_100, 100);
  assert.ok(dirty.score_100 < clean.score_100);
});

test("degenerate input is handled", () => {
  for (const s of ["", "   ", "...", "🙂"]) {
    const r = checkTurkish(s);
    assert.ok(Array.isArray(r.findings));
    assert.ok(Number.isFinite(r.score_100));
    assert.ok(r.score_100 >= 0 && r.score_100 <= 100);
  }
});
