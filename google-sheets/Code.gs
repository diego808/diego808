/**
 * Dieta IA → Google Planilhas
 * 1. Crie uma planilha nova no Google Planilhas.
 * 2. Menu Extensões → Apps Script. Apague o conteúdo e cole este arquivo. Salve.
 * 3. Implantar → Nova implantação → tipo "App da Web".
 *    Executar como: Eu | Quem pode acessar: Qualquer pessoa. Clique em Implantar e autorize.
 * 4. Copie a URL (termina em /exec) e cole em Config → Google Planilhas no app.
 */
const ENTRY_HEADER = ["Data", "Hora", "Refeição", "Alimento", "Quantidade", "Kcal", "Proteína (g)", "Carbo (g)", "Gordura (g)", "O que foi dito", "ID"];
const WEIGHT_HEADER = ["Data", "Peso (kg)"];

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function append_(sh, rows) {
  if (rows && rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureSummary_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName("Resumo")) return;
  const sh = ss.insertSheet("Resumo");
  sh.getRange("A1").setFormula(
    '=QUERY(Registros!A:I, "select A, sum(F), sum(G), sum(H), sum(I) where A is not null group by A order by A desc ' +
    'label sum(F) \'Kcal\', sum(G) \'Proteína\', sum(H) \'Carbo\', sum(I) \'Gordura\'", 1)'
  );
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const reg = sheet_("Registros", ENTRY_HEADER);
    const peso = sheet_("Peso", WEIGHT_HEADER);
    if (data.type === "entries") append_(reg, data.rows);
    if (data.type === "weight") append_(peso, data.rows);
    if (data.type === "replaceAll") {
      reg.clear(); peso.clear();
      sheet_("Registros", ENTRY_HEADER); sheet_("Peso", WEIGHT_HEADER);
      append_(reg, data.rows);
      append_(peso, data.weights);
    }
    ensureSummary_();
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
