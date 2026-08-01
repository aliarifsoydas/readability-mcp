import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../.test-build/scorers/index.js";

test("Cyrillic text is detected as Russian", () => {
  const samples = [
    "Городской совет утвердил новый план развития транспорта на пять лет.",
    "Кот спит на печке. Мышь бежит домой.",
    "Институциональная трансформация экономических отношений в обществе.",
  ];
  for (const s of samples) assert.equal(detectLanguage(s), "ru", s);
});

test("Latin brand names inside Russian text do not flip detection", () => {
  assert.equal(detectLanguage("Компания Apple представила новый iPhone. Продажи начались в России."), "ru");
});

test("Latin-script languages are unaffected by the Cyrillic short circuit", () => {
  const cases = [
    ["The quick brown fox jumps over the lazy dog and then runs away.", "en"],
    ["Bu cümle Türkçedir ve ığşü gibi harfler içerir. Ayrıca çok kısadır.", "tr"],
    ["El gato duerme en la casa y los niños juegan en el parque.", "es"],
    ["Der Hund ist im Garten und die Katze schläft auf dem Sofa.", "de"],
  ];
  for (const [text, expected] of cases) assert.equal(detectLanguage(text), expected, text);
});

test("a Russian sentence quoted inside English still reads as English", () => {
  const text =
    "This article discusses Russian readability metrics in some detail. " +
    "The authors cite the phrase кот спит as an example of a short clause. " +
    "The rest of the discussion continues in English for several more sentences.";
  assert.equal(detectLanguage(text), "en");
});

test("empty and non-letter input falls back to English", () => {
  for (const input of ["", "   ", "1234", "!!!", "🙂"]) {
    assert.equal(detectLanguage(input), "en", JSON.stringify(input));
  }
});
