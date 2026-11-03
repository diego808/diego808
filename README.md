# 🥗 Dieta IA

App (página web instalável no celular) para emagrecer com ajuda de IA:

- **Fale o que comeu** (🎤 voz em português), escreva ou **tire foto do prato** — a IA (Claude) identifica os alimentos e estima calorias, proteína, carboidrato e gordura.
- **Limite diário de calorias** calculado pelo seu perfil (fórmula Mifflin-St Jeor + nível de atividade + ritmo de emagrecimento escolhido).
- **Compensação nos próximos dias:** se passar do limite, o excesso é descontado aos poucos (≈⅓ por dia) nos dias seguintes, sem nunca ficar abaixo do piso de segurança (1.200 kcal mulheres / 1.500 kcal homens). A aba **Plano** mostra os limites dos próximos 7 dias.
- **Controle:** anel de progresso do dia, macros, histórico dos últimos 30 dias e gráfico de peso.
- **Planilha:** baixe tudo em **Excel** (abas Resumo diário, Registros, Peso) ou CSV, e/ou sincronize automaticamente com o **Google Planilhas**.
- **Sugestões da IA:** próxima refeição que cabe no que resta, análise do dia/semana e perguntas livres ("posso comer pizza hoje?").

Os dados ficam salvos no próprio celular (há botão de backup/restauração em Config).

## Como colocar no celular

1. **Publicar a página (GitHub Pages):** no GitHub, abra *Settings → Pages* deste repositório, em *Source* escolha *Deploy from a branch*, selecione a branch onde está o app e a pasta `/ (root)`, e salve. Em ~1 minuto o endereço aparece ali (algo como `https://SEU-USUARIO.github.io/diego808/`).
   > Repositório privado precisa de plano pago para usar Pages. Alternativa gratuita: arraste a pasta para [app.netlify.com/drop](https://app.netlify.com/drop).
2. Abra o endereço no celular:
   - **Android (Chrome):** menu ⋮ → *Adicionar à tela inicial / Instalar app*.
   - **iPhone (Safari):** botão Compartilhar → *Adicionar à Tela de Início*.
3. No app, vá em **Config**: preencha seu perfil e cole sua **chave da API do Claude** (crie em [console.anthropic.com](https://console.anthropic.com/settings/keys) — é paga por uso, cada registro custa uma fração de centavo de dólar). A chave fica salva só no seu celular.

## Sincronizar com Google Planilhas (opcional)

1. Crie uma planilha nova em [sheets.new](https://sheets.new).
2. *Extensões → Apps Script*, apague o conteúdo e cole o arquivo [`google-sheets/Code.gs`](google-sheets/Code.gs). Salve.
3. *Implantar → Nova implantação* → tipo **App da Web** · Executar como **Eu** · Acesso **Qualquer pessoa** → Implantar e autorize.
4. Copie a URL que termina em `/exec` e cole em **Config → Google Planilhas** no app.

A cada refeição registrada, uma linha é adicionada na aba *Registros*; o peso vai para *Peso* e a aba *Resumo* soma as calorias por dia. O botão "Enviar tudo p/ Google Planilhas" (aba Histórico) regrava tudo de uma vez.

## Rodar localmente

```bash
npm start      # serve em http://localhost:8080
npm test       # testes do cálculo de calorias
```

Arquivos: `index.html` (interface), `app.js` (lógica, IA, planilha), `calc.js` (cálculo de metas e compensação), `sw.js` + `manifest.webmanifest` (instalação/offline).

> As estimativas são aproximadas e não substituem acompanhamento de nutricionista ou médico.
