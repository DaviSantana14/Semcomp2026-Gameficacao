import assert from "node:assert/strict";
import test from "node:test";
import { generateCpf, generateCpfs, isValidCpf } from "./cpf.mjs";

test("generates deterministic, unique, valid CPFs for the rehearsal cohort", () => {
  const firstRun = generateCpfs(150);
  const secondRun = generateCpfs(150);

  assert.deepEqual(firstRun, secondRun);
  assert.equal(new Set(firstRun).size, 150);
  assert.ok(firstRun.every(isValidCpf));
});

test("generates the same CPF for the same non-negative index", () => {
  assert.equal(generateCpf(42), generateCpf(42));
  assert.notEqual(generateCpf(42), generateCpf(43));
});

test("rejects invalid generator arguments", () => {
  assert.throws(() => generateCpf(-1), RangeError);
  assert.throws(() => generateCpf(1.5), RangeError);
  assert.throws(() => generateCpfs(-1), RangeError);
  assert.throws(() => generateCpfs(1.5), RangeError);
});
