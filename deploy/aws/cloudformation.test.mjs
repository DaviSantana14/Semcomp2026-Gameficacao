import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const template = await readFile(
  new URL("./cloudformation.yml", import.meta.url),
  "utf8",
);

const instanceTypeParameter = template.match(
  /^  InstanceType:\r?\n(?<body>(?:^    .*\r?\n)*)/m,
)?.groups?.body;

test("defaults the rehearsal to the eligible m7i-flex.large instance", () => {
  assert.ok(instanceTypeParameter, "InstanceType parameter must exist");
  assert.match(instanceTypeParameter, /^    Default: m7i-flex\.large$/m);
});

test("keeps paid T3 sizes available alongside m7i-flex.large", () => {
  assert.ok(instanceTypeParameter, "InstanceType parameter must exist");

  const allowedValues = new Set(
    instanceTypeParameter
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2)),
  );

  for (const instanceType of ["m7i-flex.large", "t3.large", "t3.xlarge"]) {
    assert.ok(
      allowedValues.has(instanceType),
      `${instanceType} must be allowed`,
    );
  }
});
