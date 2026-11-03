import {
  dayKey, addDays, baseTarget, computePlan, minKcal, profileComplete, sumDay, tdee, weeksToGoal,
} from "./calc.js";

// ---------- Estado ----------
const STORE_KEY = "dietaia:v1";
const MODEL = "claude-opus-5-5";
const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.136.0/+esm";
const MEALS = { cafe: "Café da manhã", almoco: "Almoço", lanche: "Lanche", jantar: "Jantar", ceia: "Ceia" };

const defaults = {
  profile: { sex: "m", age: "", height: "", weight: "", goal: "", rate: 0.5, activity: 1.2, prefs: "", manualTarget: "" },
  apiKey: "",
  sheetUrl: "",
  log: {},      // { "AAAA-MM-DD": [ {id, time, meal, name, qty, kcal, protein, carbs, fat} ] }
  weights: {},  // { "AAAA-MM-DD": kg }
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) { console.warn(e); }
  return structuredClone(defaults);
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast("Não consegui salvar no aparelho: " + e.message); }
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString("pt-BR");
const today = () => dayKey();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function prettyDate(key, opts = { weekday: "short", day: "2-digit", month: "2-digit" }) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", opts);
}
function profileNums() {
  const p = state.profile;
  return { ...p, age: +p.age, height: +p.height, weight: +p.weight, goal: +p.goal, rate: +p.rate, activity: +p.activity, manualTarget: +p.manualTarget };
}
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

// ---------- Navegação ----------
function go(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  $$("nav button").forEach((b) => b.classList.toggle("active", b.dataset.goto === view));
  window.scrollTo(0, 0);
  render();
}
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));

// ---------- Render ----------
function currentPlan() {
  const p = profileNums();
  if (!profileComplete(p) && !(p.manualTarget > 0)) return null;
  return computePlan(p, state.log, today(), 6);
}

function render() {
  $("#todayLabel").textContent = prettyDate(today(), { weekday: "long", day: "numeric", month: "long" });
  const ready = (profileComplete(profileNums()) || profileNums().manualTarget > 0) && state.apiKey;
  $("#setupHint").hidden = !!ready;
  renderToday();
  renderPlan();
  renderHistory();
}

function renderToday() {
  const plan = currentPlan();
  const entries = state.log[today()] || [];
  const tot = sumDay(entries);
  const day = plan?.get(today());
  const target = day?.target || 0;
  const pct = target ? tot.kcal / target : 0;
  const arc = $("#ringArc");
  const C = 326.7;
  arc.setAttribute("stroke-dashoffset", String(C - C * Math.min(pct, 1)));
  arc.setAttribute("stroke", pct > 1 ? "var(--bad)" : pct > 0.9 ? "var(--warn)" : "var(--accent)");
  $("#ringPct").textContent = target ? Math.round(pct * 100) + "%" : "—";
  const rem = target - tot.kcal;
  $("#remaining").textContent = target ? (rem >= 0 ? fmt(rem) + " kcal" : "+" + fmt(-rem) + " kcal") : "—";
  $("#remaining").style.color = rem < 0 ? "var(--bad)" : "";
  $("#consumedLine").textContent = target ? `${fmt(tot.kcal)} de ${fmt(target)} kcal` : "Complete seu perfil";
  $("#mP").textContent = fmt(tot.protein) + " g";
  $("#mC").textContent = fmt(tot.carbs) + " g";
  $("#mF").textContent = fmt(tot.fat) + " g";

  let banner = "";
  if (day?.payback > 0) banner += `<div class="banner warn">Hoje seu limite está ${fmt(day.payback)} kcal menor para compensar excessos anteriores.</div>`;
  if (target && rem < 0) {
    const tomorrow = plan.get(addDays(today(), 1));
    banner += `<div class="banner bad">Você passou ${fmt(-rem)} kcal. Isso será compensado nos próximos dias (amanhã: ${fmt(tomorrow.target)} kcal).</div>`;
  } else if (target && entries.length && rem <= target * 0.1) {
    banner += `<div class="banner warn">Quase no limite — prefira algo leve se ainda for comer.</div>`;
  }
  $("#todayBanner").innerHTML = banner;

  const list = $("#mealsList");
  if (!entries.length) { list.innerHTML = '<p class="muted">Nada registrado ainda.</p>'; return; }
  let html = "";
  for (const [k, label] of Object.entries(MEALS)) {
    const items = entries.filter((e) => e.meal === k);
    if (!items.length) continue;
    html += `<div class="meal"><h3>${label} · ${fmt(sumDay(items).kcal)} kcal</h3>`;
    for (const e of items) {
      html += `<div class="item"><div class="name">${esc(e.name)}<small>${esc(e.qty)} · P ${fmt(e.protein)}g · C ${fmt(e.carbs)}g · G ${fmt(e.fat)}g</small></div>
        <div class="kcal">${fmt(e.kcal)}</div><button class="del" data-del="${e.id}" aria-label="Apagar">×</button></div>`;
    }
    html += "</div>";
  }
  list.innerHTML = html;
  list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Apagar este item?")) return;
    state.log[today()] = (state.log[today()] || []).filter((e) => e.id !== b.dataset.del);
    save(); render();
  }));
}

function renderPlan() {
  const plan = currentPlan();
  if (!plan) { $("#planTable").innerHTML = ""; $("#planExplain").textContent = "Preencha seu perfil em Config."; return; }
  const p = profileNums();
  const base = baseTarget(p);
  $("#planExplain").textContent =
    `Meta base: ${fmt(base)} kcal/dia. Se você passar do limite, o excesso é descontado aos poucos nos dias seguintes (nunca abaixo de ${fmt(Math.min(base, minKcal(p)))} kcal).`;
  let rows = `<tr><th>Dia</th><th class="num">Limite</th><th class="num">Consumido</th></tr>`;
  for (let i = 0; i <= 6; i++) {
    const k = addDays(today(), i);
    const d = plan.get(k);
    const note = d.payback ? ` <span class="muted">(−${fmt(d.payback)})</span>` : "";
    rows += `<tr><td>${i === 0 ? "<b>Hoje</b>" : prettyDate(k)}</td><td class="num">${fmt(d.target)}${note}</td>
      <td class="num">${d.logged ? fmt(d.consumed) : "—"}</td></tr>`;
  }
  const last = plan.get(addDays(today(), 6));
  if (last.debtAfter > 0) rows += `<tr><td colspan="3" class="muted">Ainda restam ${fmt(last.debtAfter)} kcal a compensar depois disso.</td></tr>`;
  $("#planTable").innerHTML = rows;

  // Peso
  const ws = Object.entries(state.weights).sort(([a], [b]) => a.localeCompare(b));
  const cur = ws.length ? ws[ws.length - 1][1] : p.weight;
  const info = [];
  if (cur) info.push(`Atual: <b>${String(cur).replace(".", ",")} kg</b>`);
  if (p.goal) info.push(`Meta: ${String(p.goal).replace(".", ",")} kg`);
  if (cur && p.goal && cur > p.goal) info.push(`Faltam ${(cur - p.goal).toFixed(1).replace(".", ",")} kg (~${weeksToGoal({ ...p, weight: cur })} semanas)`);
  if (ws.length > 1) {
    const diff = ws[ws.length - 1][1] - ws[0][1];
    info.push(`Desde ${prettyDate(ws[0][0])}: ${diff > 0 ? "+" : ""}${diff.toFixed(1).replace(".", ",")} kg`);
  }
  $("#weightInfo").innerHTML = info.join(" · ");
  const svg = $("#weightChart");
  if (ws.length > 1) {
    const pts = ws.slice(-30);
    const vals = pts.map(([, v]) => v);
    if (p.goal) vals.push(p.goal);
    const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
    const x = (i) => 10 + (i * 300) / Math.max(pts.length - 1, 1);
    const y = (v) => 110 - ((v - lo) / (hi - lo)) * 100;
    const path = pts.map(([, v], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    svg.innerHTML =
      (p.goal ? `<line x1="10" x2="310" y1="${y(p.goal)}" y2="${y(p.goal)}" stroke="var(--accent)" stroke-dasharray="4 4"/>` : "") +
      `<path d="${path}" fill="none" stroke="var(--text)" stroke-width="2"/>` +
      pts.map(([, v], i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--text)"/>`).join("");
    svg.hidden = false;
  } else svg.hidden = true;
}

function renderHistory() {
  const plan = currentPlan();
  const days = Object.keys(state.log).filter((k) => state.log[k].length).sort().reverse().slice(0, 30);
  if (!days.length) { $("#histTable").innerHTML = '<tr><td class="muted">Sem registros ainda.</td></tr>'; return; }
  let rows = `<tr><th>Dia</th><th class="num">Consumido</th><th class="num">Limite</th></tr>`;
  for (const k of days) {
    const c = sumDay(state.log[k]).kcal;
    const t = plan?.get(k)?.target;
    const pct = t ? Math.min(c / t, 1) * 100 : 0;
    const color = t && c > t ? "var(--bad)" : "var(--accent)";
    rows += `<tr><td>${prettyDate(k)}<div class="bar"><i style="width:${pct}%;background:${color}"></i></div></td>
      <td class="num" style="color:${t && c > t ? "var(--bad)" : ""}">${fmt(c)}</td><td class="num">${t ? fmt(t) : "—"}</td></tr>`;
  }
  $("#histTable").innerHTML = rows;
}

// ---------- IA (Claude) ----------
let clientPromise;
async function claude() {
  if (!state.apiKey) { go("config"); throw new Error("Cadastre sua chave da API em Config."); }
  if (!clientPromise) {
    clientPromise = import(SDK_URL).then(({ default: Anthropic }) =>
      new Anthropic({ apiKey: state.apiKey, dangerouslyAllowBrowser: true }));
  }
  return clientPromise;
}

async function ask({ system, content, effort = "medium", schema }) {
  const client = await claude();
  const output_config = { effort };
  if (schema) output_config.format = { type: "json_schema", schema };
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config,
      system,
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    const status = e?.status;
    if (status === 401) throw new Error("Chave da API inválida. Confira em Config.");
    if (status === 429) throw new Error("Muitas requisições — espere um pouco e tente de novo.");
    if (status >= 500) throw new Error("A IA está indisponível agora. Tente em instantes.");
    if (!status) throw new Error("Sem conexão com a IA. Verifique a internet.");
    throw new Error(e?.error?.error?.message || e.message);
  }
  if (res.stop_reason === "refusal") throw new Error("A IA não pôde responder a esse pedido.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (res.stop_reason === "max_tokens") throw new Error("Resposta muito longa — tente de novo com menos itens.");
  return text;
}

const FOOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["itens", "comentario"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["refeicao", "nome", "quantidade", "kcal", "proteina_g", "carbo_g", "gordura_g"],
        properties: {
          refeicao: { type: "string", enum: Object.keys(MEALS) },
          nome: { type: "string" },
          quantidade: { type: "string" },
          kcal: { type: "number" },
          proteina_g: { type: "number" },
          carbo_g: { type: "number" },
          gordura_g: { type: "number" },
        },
      },
    },
    comentario: { type: "string" },
  },
};

function contextBlock() {
  const p = profileNums();
  const plan = currentPlan();
  const t = today();
  const entries = state.log[t] || [];
  const tot = sumDay(entries);
  const target = plan?.get(t)?.target;
  const last7 = [];
  for (let i = 7; i >= 1; i--) {
    const k = addDays(t, -i);
    if (state.log[k]?.length) last7.push(`${k}: ${fmt(sumDay(state.log[k]).kcal)} kcal (limite ${fmt(plan?.get(k)?.target || 0)})`);
  }
  const next = plan ? [1, 2, 3].map((i) => `${addDays(t, i)}: ${fmt(plan.get(addDays(t, i)).target)} kcal`).join("; ") : "";
  return [
    `Data/hora agora: ${new Date().toLocaleString("pt-BR")}`,
    `Perfil: ${p.sex === "f" ? "mulher" : "homem"}, ${p.age} anos, ${p.height} cm, ${p.weight} kg, meta ${p.goal} kg, gasto estimado ${fmt(tdee(p))} kcal/dia.`,
    p.prefs ? `Preferências/restrições: ${p.prefs}` : "",
    target ? `Limite de hoje: ${fmt(target)} kcal. Consumido: ${fmt(tot.kcal)} kcal (P ${fmt(tot.protein)}g, C ${fmt(tot.carbs)}g, G ${fmt(tot.fat)}g). Restam ${fmt(target - tot.kcal)} kcal.` : "",
    entries.length ? `Comido hoje: ${entries.map((e) => `${MEALS[e.meal]}: ${e.name} (${e.qty}, ${fmt(e.kcal)} kcal)`).join("; ")}` : "Nada registrado hoje ainda.",
    last7.length ? `Últimos dias: ${last7.join("; ")}` : "",
    next ? `Limites dos próximos dias: ${next}` : "",
  ].filter(Boolean).join("\n");
}

const SYSTEM_FOOD = `Você é um nutricionista brasileiro que registra o que a pessoa comeu.
Transforme a descrição (texto falado, possivelmente informal) e/ou a foto em itens de alimento com estimativas realistas de calorias e macronutrientes.
- Use porções típicas brasileiras quando a quantidade não for dita (ex.: 1 pão francês ≈ 50 g, 1 colher de servir de arroz ≈ 45 g).
- ARROZ E FEIJÃO (qualquer tipo, cozidos): a "quantidade" deve SEMPRE estar em conchas e gramas, no formato "1½ concha (150 g)".
  Referência: 1 concha média = 100 g. Se a pessoa falar em colheres, converta (1 colher de servir ≈ 45 g ≈ ½ concha); se não disser quanto, use 1 concha (100 g).
  Calorias por 100 g: arroz branco 128 kcal, arroz integral 124 kcal, feijão carioca com caldo 76 kcal, feijão preto com caldo 77 kcal; feijão gordo/tropeiro/feijoada calcule pelo preparo.
- Considere o modo de preparo (fritura, óleo, açúcar no café, molhos) quando mencionado ou provável.
- Classifique cada item em uma refeição: cafe, almoco, lanche, jantar ou ceia. Se a pessoa não disser, deduza pelo horário atual.
- "quantidade" é curta e legível (ex.: "1 concha (100 g)", "1 filé médio (120 g)").
- "comentario": 1 ou 2 frases curtas e encorajadoras em português, considerando quanto ainda resta de calorias hoje e, se fizer sentido, uma dica prática. Sem julgamentos.
- Se a mensagem não descrever comida, retorne itens vazio e explique no comentario.`;

const SYSTEM_COACH = `Você é um nutricionista brasileiro, prático e encorajador, ajudando a pessoa a emagrecer com um déficit calórico sustentável.
Responda em português do Brasil, curto e direto (no máximo ~12 linhas), usando listas com "- " e **negrito** para destacar.
Sugira comidas comuns no Brasil, fáceis de achar, com calorias aproximadas. Priorize proteína, fibras e saciedade.
Respeite o limite de calorias restante e as restrições informadas. Nunca recomende ficar abaixo de {MIN} kcal no dia nem jejuns extremos.
Se a pergunta envolver saúde (doenças, remédios, sintomas), recomende procurar um profissional.`;

function renderAi(text) {
  const html = esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^#+\s*(.+)$/gm, "<strong>$1</strong>")
    .replace(/^- /gm, "• ");
  $("#aiOut").innerHTML = html;
}

function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${label || ""}`; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label; btn.disabled = false; }
}

let photo = null; // { data, media_type, url }

async function logFood() {
  const text = $("#foodInput").value.trim();
  if (!text && !photo) { toast("Diga ou escreva o que você comeu."); return; }
  const btn = $("#logBtn");
  busy(btn, true, "Analisando…");
  try {
    const content = [];
    if (photo) content.push({ type: "image", source: { type: "base64", media_type: photo.media_type, data: photo.data } });
    content.push({ type: "text", text: `${contextBlock()}\n\nO que comi: ${text || "(veja a foto)"}` });
    const raw = await ask({ system: SYSTEM_FOOD, content, effort: "low", schema: FOOD_SCHEMA });
    const data = JSON.parse(raw);
    if (!data.itens?.length) { renderAi(data.comentario || "Não identifiquei alimentos."); return; }
    const t = today();
    const now = new Date().toTimeString().slice(0, 5);
    const added = data.itens.map((i) => ({
      id: crypto.randomUUID(), time: now, meal: MEALS[i.refeicao] ? i.refeicao : "lanche",
      name: i.nome, qty: i.quantidade, kcal: Math.round(i.kcal),
      protein: Math.round(i.proteina_g), carbs: Math.round(i.carbo_g), fat: Math.round(i.gordura_g), said: text,
    }));
    (state.log[t] ||= []).push(...added);
    save();
    $("#foodInput").value = "";
    clearPhoto();
    render();
    renderAi(`✅ Registrado: ${added.map((a) => `${a.name} (${fmt(a.kcal)} kcal)`).join(", ")}\n\n${data.comentario}`);
    toast(`+${fmt(sumDay(added).kcal)} kcal registradas`);
    syncToSheet(t, added);
  } catch (e) {
    toast(e.message);
  } finally { busy(btn, false); }
}

async function coach(question, btn) {
  busy(btn, true);
  $("#aiOut").innerHTML = '<span class="muted"><span class="spinner"></span> Pensando…</span>';
  try {
    const sys = SYSTEM_COACH.replace("{MIN}", String(minKcal(profileNums())));
    const text = await ask({ system: sys, content: `${contextBlock()}\n\n${question}`, effort: "medium" });
    renderAi(text);
  } catch (e) {
    $("#aiOut").textContent = "";
    toast(e.message);
  } finally { busy(btn, false); }
}

$("#logBtn").addEventListener("click", logFood);
$$("[data-suggest]").forEach((b) => b.addEventListener("click", () => {
  const q = b.dataset.suggest === "proxima"
    ? "Sugira 3 opções para minha próxima refeição que caibam no que resta de calorias hoje, com calorias aproximadas de cada uma."
    : "Analise meu dia e minha semana: o que estou fazendo bem, o que melhorar, e uma meta simples para amanhã.";
  coach(q, b);
}));
$("#askBtn").addEventListener("click", () => {
  const q = $("#askInput").value.trim();
  if (!q) return;
  $("#askInput").value = "";
  coach(q, $("#askBtn"));
});
$("#askInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#askBtn").click(); });

// ---------- Voz ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$("#micBtn").addEventListener("click", () => {
  if (!SR) { toast("Seu navegador não tem reconhecimento de voz. Use o microfone do teclado."); $("#foodInput").focus(); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = true;
  const startText = $("#foodInput").value.trim();
  rec.onresult = (ev) => {
    let said = "";
    for (const r of ev.results) said += r[0].transcript;
    $("#foodInput").value = (startText ? startText + " " : "") + said.trim();
  };
  rec.onerror = (ev) => { if (ev.error !== "no-speech" && ev.error !== "aborted") toast("Erro no microfone: " + ev.error); };
  rec.onend = () => { rec = null; $("#micBtn").classList.remove("on"); };
  rec.start();
  $("#micBtn").classList.add("on");
});

// ---------- Foto ----------
$("#photoBtn").addEventListener("click", () => $("#photoInput").click());
$("#photoInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.8);
    photo = { url, media_type: "image/jpeg", data: url.split(",")[1] };
    $("#photoPreview").innerHTML = `<img src="${url}" alt="Foto do prato"> <button class="del" id="rmPhoto">remover</button>`;
    $("#photoPreview").hidden = false;
    $("#rmPhoto").addEventListener("click", clearPhoto);
  } catch (e) { toast("Não consegui ler a foto."); }
  ev.target.value = "";
});
function clearPhoto() { photo = null; $("#photoPreview").hidden = true; $("#photoPreview").innerHTML = ""; }

// ---------- Peso ----------
$("#weightBtn").addEventListener("click", () => {
  const v = parseFloat(String($("#weightInput").value).replace(",", "."));
  if (!(v > 20 && v < 400)) { toast("Peso inválido."); return; }
  state.weights[today()] = v;
  state.profile.weight = v; // mantém o cálculo de calorias atualizado
  save();
  fillConfig();
  $("#weightInput").value = "";
  render();
  toast("Peso salvo.");
  syncWeight(today(), v);
});

// ---------- Planilha ----------
function allRows() {
  const plan = currentPlan();
  const entries = [];
  const daily = [];
  for (const k of Object.keys(state.log).sort()) {
    const list = state.log[k];
    if (!list.length) continue;
    for (const e of list) {
      entries.push({ Data: k, Hora: e.time, Refeição: MEALS[e.meal] || e.meal, Alimento: e.name, Quantidade: e.qty,
        Kcal: e.kcal, "Proteína (g)": e.protein, "Carbo (g)": e.carbs, "Gordura (g)": e.fat, "O que foi dito": e.said || "" });
    }
    const s = sumDay(list);
    const t = plan?.get(k)?.target || "";
    daily.push({ Data: k, "Consumido (kcal)": s.kcal, "Limite (kcal)": t, "Saldo (kcal)": t ? t - s.kcal : "",
      "Proteína (g)": s.protein, "Carbo (g)": s.carbs, "Gordura (g)": s.fat, "Peso (kg)": state.weights[k] ?? "" });
  }
  const weights = Object.entries(state.weights).sort(([a], [b]) => a.localeCompare(b)).map(([Data, kg]) => ({ Data, "Peso (kg)": kg }));
  return { entries, daily, weights };
}

$("#xlsxBtn").addEventListener("click", () => {
  if (!window.XLSX) { toast("Planilha indisponível offline — use CSV."); return; }
  const { entries, daily, weights } = allRows();
  if (!entries.length) { toast("Nada para exportar ainda."); return; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daily), "Resumo diário");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entries), "Registros");
  if (weights.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weights), "Peso");
  XLSX.writeFile(wb, `dieta-${today()}.xlsx`);
});

$("#csvBtn").addEventListener("click", () => {
  const { entries } = allRows();
  if (!entries.length) { toast("Nada para exportar ainda."); return; }
  const cols = Object.keys(entries[0]);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.map(q).join(";"), ...entries.map((r) => cols.map((c) => q(r[c])).join(";"))].join("\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `dieta-${today()}.csv`);
});

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function postSheet(payload) {
  if (!state.sheetUrl) return false;
  // Apps Script não responde CORS: enviamos em "no-cors" (fire-and-forget).
  await fetch(state.sheetUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
  return true;
}
function entryRow(day, e) {
  return [day, e.time, MEALS[e.meal] || e.meal, e.name, e.qty, e.kcal, e.protein, e.carbs, e.fat, e.said || "", e.id];
}
async function syncToSheet(day, added) {
  try { await postSheet({ type: "entries", rows: added.map((e) => entryRow(day, e)) }); }
  catch { toast("Não consegui enviar para o Google Planilhas agora."); }
}
async function syncWeight(day, kg) {
  try { await postSheet({ type: "weight", rows: [[day, kg]] }); } catch { /* offline */ }
}
$("#syncAllBtn").addEventListener("click", async () => {
  if (!state.sheetUrl) { toast("Configure a URL do Apps Script em Config."); go("config"); return; }
  const rows = [];
  for (const k of Object.keys(state.log).sort()) for (const e of state.log[k]) rows.push(entryRow(k, e));
  const weights = Object.entries(state.weights).sort(([a], [b]) => a.localeCompare(b));
  try {
    await postSheet({ type: "replaceAll", rows, weights });
    toast(`Enviado: ${rows.length} itens.`);
  } catch { toast("Falha ao enviar. Verifique a internet e a URL."); }
});

// ---------- Config ----------
const fields = { pSex: "sex", pAge: "age", pHeight: "height", pWeight: "weight", pGoal: "goal", pRate: "rate", pAct: "activity", pPrefs: "prefs", pManual: "manualTarget" };
function fillConfig() {
  for (const [id, key] of Object.entries(fields)) $("#" + id).value = state.profile[key] ?? "";
  $("#apiKey").value = state.apiKey;
  $("#sheetUrl").value = state.sheetUrl;
  updateCalcInfo();
}
function readConfig() {
  for (const [id, key] of Object.entries(fields)) state.profile[key] = $("#" + id).value.trim().replace(",", ".");
}
function updateCalcInfo() {
  readConfig();
  const p = profileNums();
  const el = $("#calcInfo");
  if (!profileComplete(p) && !(p.manualTarget > 0)) { el.hidden = true; return; }
  el.hidden = false;
  const parts = [];
  if (profileComplete(p)) parts.push(`Gasto estimado: <b>${fmt(tdee(p))} kcal/dia</b>`);
  parts.push(`Sua meta: <b>${fmt(baseTarget(p))} kcal/dia</b>`);
  if (p.goal && p.weight > p.goal && !(p.manualTarget > 0)) parts.push(`Meta de peso em ~${weeksToGoal(p)} semanas`);
  el.innerHTML = parts.join("<br>");
}
Object.keys(fields).forEach((id) => $("#" + id).addEventListener("input", updateCalcInfo));
$("#saveCfg").addEventListener("click", () => {
  readConfig();
  const key = $("#apiKey").value.trim();
  if (key !== state.apiKey) clientPromise = null;
  state.apiKey = key;
  state.sheetUrl = $("#sheetUrl").value.trim();
  const w = +state.profile.weight;
  if (w > 0 && !Object.keys(state.weights).length) state.weights[today()] = w;
  save();
  toast("Configurações salvas.");
  go("hoje");
});
$("#backupBtn").addEventListener("click", () => {
  const { apiKey, ...rest } = state; // não exporta a chave
  download(new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" }), `dieta-backup-${today()}.json`);
});
$("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
$("#restoreInput").addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.log) throw new Error();
    if (!confirm("Substituir os dados atuais pelo backup?")) return;
    state = { ...defaults, ...data, apiKey: state.apiKey };
    save(); fillConfig(); render(); toast("Backup restaurado.");
  } catch { toast("Arquivo de backup inválido."); }
  ev.target.value = "";
});

// ---------- Início ----------
fillConfig();
render();
// Atualiza a virada do dia se o app ficar aberto.
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
