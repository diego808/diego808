// Cálculos de calorias — sem dependências, testável no Node.

export const KCAL_PER_KG = 7700;

/** Data local no formato AAAA-MM-DD. */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/** Piso de segurança: nunca recomendar menos que isso. */
export function minKcal(profile) {
  return profile.sex === "f" ? 1200 : 1500;
}

/** Gasto basal (Mifflin-St Jeor). */
export function bmr({ sex, age, height, weight }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === "f" ? -161 : 5);
}

export function tdee(profile) {
  return bmr(profile) * Number(profile.activity || 1.2);
}

export function profileComplete(p) {
  return !!(p && p.age > 0 && p.height > 0 && p.weight > 0);
}

/** Meta diária base, antes de compensações. */
export function baseTarget(profile) {
  if (profile.manualTarget > 0) return Math.round(profile.manualTarget);
  const deficit = (Number(profile.rate || 0.5) * KCAL_PER_KG) / 7;
  return Math.round(Math.max(minKcal(profile), tdee(profile) - deficit));
}

export function sumDay(entries) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries || []) {
    t.kcal += e.kcal || 0;
    t.protein += e.protein || 0;
    t.carbs += e.carbs || 0;
    t.fat += e.fat || 0;
  }
  return t;
}

/**
 * Calcula o limite de cada dia, do primeiro registro até `today + daysAhead`.
 * Excesso de um dia vira "dívida", paga nos dias seguintes (≈1/3 por dia),
 * sem nunca deixar a meta abaixo do piso de segurança. Sobras não viram bônus.
 * Retorna Map(dayKey -> { target, base, payback, consumed, logged, debtAfter }).
 */
export function computePlan(profile, log, today, daysAhead = 6) {
  const base = baseTarget(profile);
  const floor = Math.min(base, minKcal(profile));
  const loggedDays = Object.keys(log).filter((k) => (log[k] || []).length).sort();
  const start = loggedDays.length && loggedDays[0] < today ? loggedDays[0] : today;
  const end = addDays(today, daysAhead);
  const plan = new Map();
  let debt = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const maxPay = base - floor;
    const payback = Math.round(Math.min(debt, maxPay, Math.max(debt / 3, 100)));
    const target = base - payback;
    debt -= payback;
    const entries = log[d] || [];
    const logged = entries.length > 0 && d <= today;
    const consumed = sumDay(entries).kcal;
    // Excesso (inclusive o de hoje) é compensado a partir do dia seguinte.
    if (logged && consumed > target) debt += consumed - target;
    plan.set(d, { target, base, payback, consumed, logged, debtAfter: Math.round(debt) });
  }
  return plan;
}

/** Semanas estimadas até a meta, no ritmo escolhido. */
export function weeksToGoal(profile) {
  const diff = Number(profile.weight) - Number(profile.goal);
  if (!(diff > 0)) return 0;
  return Math.ceil(diff / Number(profile.rate || 0.5));
}
