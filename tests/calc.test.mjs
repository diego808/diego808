import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, baseTarget, computePlan, minKcal } from "../calc.js";

const profile = { sex: "m", age: 35, height: 178, weight: 95, goal: 80, rate: 0.5, activity: 1.375 };

test("meta base = gasto - déficit, respeitando o piso", () => {
  const t = baseTarget(profile);
  assert.ok(t > 2000 && t < 2600, String(t));
  assert.equal(baseTarget({ ...profile, sex: "f", weight: 50, height: 150, age: 60, rate: 1 }), 1200);
  assert.equal(baseTarget({ ...profile, manualTarget: 1800 }), 1800);
});

test("excesso de hoje reduz os próximos dias e é totalmente compensado", () => {
  const today = "2026-11-03";
  const base = baseTarget(profile);
  const log = { [today]: [{ kcal: base + 900 }] };
  const plan = computePlan(profile, log, today, 6);
  assert.equal(plan.get(today).target, base);
  const paid = [1, 2, 3, 4, 5, 6].reduce((s, i) => s + plan.get(addDays(today, i)).payback, 0);
  assert.equal(paid, 900);
  assert.equal(plan.get(addDays(today, 1)).target, base - 300);
});

test("nunca abaixo do piso de segurança", () => {
  const today = "2026-11-03";
  const log = { [addDays(today, -1)]: [{ kcal: 9000 }] };
  const plan = computePlan(profile, log, today, 6);
  for (const d of plan.values()) assert.ok(d.target >= minKcal(profile));
  assert.ok(plan.get(addDays(today, 6)).debtAfter > 0);
});

test("comer menos não gera bônus", () => {
  const today = "2026-11-03";
  const log = { [addDays(today, -1)]: [{ kcal: 500 }] };
  assert.equal(computePlan(profile, log, today).get(today).target, baseTarget(profile));
});
