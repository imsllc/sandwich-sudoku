import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { URL } from "node:url";
import policy from "../src/data/privacy-policy.json";
const require = createRequire(import.meta.url);
const {generatePolicy} = require("../scripts/generate-privacy-policy.cjs");

test("the offline policy contains every section of the published HTML source", () => {
  const html = readFileSync(new URL("../privacy-policy.html", import.meta.url), "utf8");
  const expected = generatePolicy(html, policy.publicUrl);
  assert.deepEqual(policy, expected);
  assert.equal(policy.sections.length, 11);
  const text = JSON.stringify(policy);
  for (const content of ["Integrated Media Systems, LLC", "integratedmediasystemsllc@gmail.com", "Remove Ads", "non-personalized", "retention", "Google Play"]) {
    assert.ok(text.toLowerCase().includes(content.toLowerCase()), content);
  }
  assert.equal(policy.publicUrl, "https://imediasystemsllc.com/sandwich-sudoku-privacy-policy.html");
});
test("policy generation refuses unsupported link schemes", () => {
  const html = readFileSync(new URL("../privacy-policy.html", import.meta.url), "utf8");
  assert.throws(() => generatePolicy(html.replace('href="https://policies.google.com/privacy"', 'href="javascript:alert(1)"'), policy.publicUrl));
});
