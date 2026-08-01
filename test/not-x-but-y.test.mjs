/**
 * The rhetorical antithesis signal. It used to be one regex per language built
 * from ASCII character classes, which made it inert for Turkish the moment a
 * ğ/ü/ş/ı/ö/ç fell between the two markers, and it had no notion of the
 * multi-item form ("not A, not B, not C — but D") at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { aiDetectScore } from "../.test-build/aidetect.js";

const hits = async (text, language) => (await aiDetectScore(text, { language })).signals.not_x_but_y;

test("Turkish diacritics between the markers no longer kill the match", async () => {
  // The markers are spelled the same in both; only the words between them
  // differ. The ASCII-only gap used to be the sole case that matched.
  const asciiGap = "Bu sadece bir alet değil, aynı zamanda bir dost.";
  const diacriticGap = "Bu sadece bir araç değil, aynı zamanda bir yol arkadaşı.";
  assert.ok((await hits(asciiGap, "tr")).count > 0, asciiGap);
  assert.ok((await hits(diacriticGap, "tr")).count > 0, diacriticGap);
});

test("the plain Turkish contrast is caught without an intensifier", async () => {
  for (const s of [
    "Sorun teknik değil, kültürel.",
    "Bu bir hata değil, bir özellik.",
    "İhtiyacımız olan daha fazla veri değil, daha iyi sorular.",
    "Mesele teknoloji değil. Mesele insan.",
    "Bu bir ürün değil — bir topluluk.",
  ]) {
    assert.ok((await hits(s, "tr")).count > 0, s);
  }
});

test("the dominant Russian antithesis is caught", async () => {
  for (const s of [
    "Это не баг, а фича.",
    "Дело не в деньгах, а в принципе.",
    "Нам нужны не новые данные, а правильные вопросы.",
    "Это не ошибка — это возможность.",
  ]) {
    assert.ok((await hits(s, "ru")).count > 0, s);
  }
});

test("English pivots other than 'but' are caught", async () => {
  for (const s of [
    "This isn't a bug — it's a feature.",
    "It's not about the destination. It's about the journey.",
    "The problem isn't the code; the problem is the culture.",
    "The goal was never speed: it was consistency.",
    "It's not what you say, it's how you say it.",
    "This is a beginning, not an end.",
  ]) {
    assert.ok((await hits(s, "en")).count > 0, s);
  }
});

test("a multi-item run counts for more than a two-part antithesis", async () => {
  const cases = [
    ["en", "It's not the price, not the features, not the marketing — it's the trust."],
    ["tr", "Ne para, ne şöhret, ne de güç — sadece huzur istiyordu."],
    ["ru", "Не в скорости, не в цене, не в масштабе — а в доверии."],
  ];
  for (const [language, text] of cases) {
    const r = await hits(text, language);
    assert.ok(r.count > 0, text);
    assert.ok(r.multi_item_runs > 0, `${text} was not recognised as a multi-item run`);
  }
  const plain = await hits("This is not a bug, but a feature.", "en");
  assert.equal(plain.multi_item_runs, 0);
});

test("ordinary concession is not antithesis", async () => {
  // `not` negating a verb, with a genuine new clause after `but`.
  for (const [language, s] of [
    ["en", "The package has not arrived yet, but I expect it tomorrow."],
    ["en", "We could not reproduce the crash locally, but CI caught it."],
    ["en", "She was not happy with the result, but she accepted it anyway."],
    ["tr", "Paket henüz gelmedi ama yarın bekliyorum."],
    ["tr", "Sonuçlar istatistiksel olarak anlamlı değildi."],
    ["ru", "Посылка ещё не пришла, но я жду её завтра."],
    ["ru", "Результаты не были статистически значимыми."],
  ]) {
    assert.equal((await hits(s, language)).count, 0, s);
  }
});

test("the reason is gated on density, not raw count", async () => {
  // A long human text accumulates antitheses as a matter of course; three in a
  // short article is the tell.
  const filler = "The committee reviewed the quarterly figures in detail. ".repeat(60);
  const sparse = `${filler} This is not a bug, but a feature. ${filler} This is a beginning, not an end.`;
  const dense = "This isn't a bug — it's a feature. It's not about speed, it's about care. This is a beginning, not an end.";
  assert.equal((await hits(sparse, "en")).reason, undefined, "long human text should not raise a reason");
  assert.ok((await hits(dense, "en")).reason, "dense antithesis should raise a reason");
});
