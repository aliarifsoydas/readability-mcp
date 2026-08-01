import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences, splitWords, countSyllables, basicStats } from "../.test-build/text.js";

test("Russian syllable counting is one per vowel", () => {
  const cases = [
    ["кот", 1],
    ["Россия", 3],
    ["предупреждала", 5],
    ["объяснить", 3],
    ["здравствуйте", 3],
    ["ёж", 1],
    ["первобытным", 4],
  ];
  for (const [word, expected] of cases) {
    assert.equal(countSyllables(word, "ru"), expected, word);
  }
});

test("Russian syllable counting is case insensitive", () => {
  assert.equal(countSyllables("КОШКА", "ru"), countSyllables("кошка", "ru"));
});

test("a vowelless word still counts as one syllable", () => {
  // Russian one-letter prepositions ("в", "с") lean on the next word
  // phonetically; counting them as one keeps averages finite.
  assert.equal(countSyllables("в", "ru"), 1);
  assert.equal(countSyllables("с", "ru"), 1);
});

test("Cyrillic words survive tokenization intact", () => {
  const words = splitWords("Кот идёт домой, а мышь — нет.");
  assert.deepEqual(words, ["Кот", "идёт", "домой", "а", "мышь", "нет"]);
});

test("sentences split on terminal punctuation and newlines", () => {
  assert.equal(splitSentences("Кот спит. Мышь бежит! Кто там?").length, 3);
  assert.equal(splitSentences("Первая строка\nВторая строка").length, 2);
});

test("a token must contain a letter or digit", () => {
  // A bare "-" used to count as a word, so every markdown bullet shared a first
  // token and the word count was inflated.
  assert.deepEqual(splitWords("- item one"), ["item", "one"]);
  assert.deepEqual(splitWords("-- --- '"), []);
  assert.deepEqual(splitWords("don't well-known co-operate O'Neill"), ["don't", "well-known", "co-operate", "O'Neill"]);
});

test("a terminator followed by a closing quote still ends the sentence", () => {
  assert.equal(splitSentences('He said "hello." Then he left. She agreed.').length, 3);
  assert.equal(splitSentences('Wait! "Really?" Yes. Fine.').length, 4);
  assert.equal(splitSentences("Done.) Next one. And another.").length, 3);
});

test("basicStats stays finite on degenerate input", () => {
  for (const input of ["", "   ", "\n\n", "...", "123 456", "🙂🙂"]) {
    const s = basicStats(input, "ru");
    for (const [key, value] of Object.entries(s)) {
      assert.ok(Number.isFinite(value), `${key} not finite for ${JSON.stringify(input)}`);
    }
  }
});

test("basicStats averages match their definitions", () => {
  const text = "Кот спит на печке. Мышь бежит домой.";
  const s = basicStats(text, "ru");
  assert.equal(s.words, 7);
  assert.equal(s.sentences, 2);
  assert.equal(s.avgSentenceLength, 3.5);
  assert.ok(Math.abs(s.avgSyllablesPerWord - s.syllables / s.words) < 1e-9);
});
