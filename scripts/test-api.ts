import "dotenv/config";

/**
 * Testa as rotas HTTP contra o servidor rodando em localhost:3737.
 *
 * Cobre o que a UI usa: CRUD de fluxos, etiquetas, conexoes, conversas,
 * leads e o webhook de entrada — incluindo os caminhos de erro.
 */

const BASE = `http://localhost:${process.env.APP_PORT ?? 3737}`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`   ${ok ? "PASS" : "FALHOU"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* rota pode devolver HTML */
  }
  return { status: res.status, json };
}

async function main() {
  console.log("Teste das rotas de API\n");

  const health = await fetch(BASE).catch(() => null);
  if (!health?.ok) {
    console.error(`Servidor nao respondeu em ${BASE}. Rode 'npm run dev' antes.`);
    process.exit(1);
  }

  /* ---------------------------------------------------------------- paginas */

  console.log("1) Paginas renderizam");
  for (const p of [
    "/",
    "/inbox",
    "/kanban",
    "/flows",
    "/contacts",
    "/tags",
    "/webhooks",
    "/connections",
    "/logs",
    "/settings",
  ]) {
    const res = await fetch(`${BASE}${p}`);
    check(`GET ${p}`, res.ok, `${res.status}`);
  }

  /* --------------------------------------------------------------- fluxos - */

  console.log("\n2) Fluxos — criar, ler, salvar, exportar, apagar");
  const criado = await req("POST", "/api/flows", { name: "__api_test" });
  check("POST /api/flows cria", criado.status === 201 && Boolean(criado.json.id));
  const flowId = criado.json.id;

  const lido = await req("GET", `/api/flows/${flowId}`);
  check("GET traz fluxo, nos e edges", Array.isArray(lido.json.nodes) && Array.isArray(lido.json.edges));
  check("fluxo novo ja vem com o gatilho", lido.json.nodes.some((n: any) => n.type === "start"));

  const salvo = await req("PUT", `/api/flows/${flowId}`, {
    name: "__api_test_renomeado",
    nodes: [
      { nodeKey: "start", type: "start", positionX: 0, positionY: 0, config: {} },
      {
        nodeKey: "m1",
        type: "message",
        positionX: 200,
        positionY: 0,
        config: { items: [{ kind: "text", value: "oi" }] },
      },
    ],
    edges: [{ edgeKey: "e1", source: "start", target: "m1", sourceHandle: "next" }],
  });
  check("PUT salva nos e edges", salvo.json.ok === true);

  const relido = await req("GET", `/api/flows/${flowId}`);
  check("persistiu os 2 nos", relido.json.nodes.length === 2, `${relido.json.nodes.length}`);
  check(
    "persistiu o sourceHandle da edge",
    relido.json.edges[0]?.sourceHandle === "next",
    relido.json.edges[0]?.sourceHandle ?? "null",
  );
  check("renomeou o fluxo", relido.json.flow.name === "__api_test_renomeado");

  const ativado = await req("PUT", `/api/flows/${flowId}`, { active: true });
  check("PUT ativa o fluxo", ativado.json.ok === true);

  // importar: manda nos junto no POST
  const importado = await req("POST", "/api/flows", {
    name: "__api_test_import",
    nodes: [
      { nodeKey: "start", type: "start", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "x", type: "end", positionX: 100, positionY: 0, config: {} },
    ],
    edges: [{ edgeKey: "e", source: "start", target: "x", sourceHandle: "next" }],
  });
  const impLido = await req("GET", `/api/flows/${importado.json.id}`);
  check("importar fluxo recria os nos", impLido.json.nodes.length === 2, `${impLido.json.nodes.length}`);

  const inexistente = await req("GET", "/api/flows/00000000-0000-0000-0000-000000000000");
  check("fluxo inexistente devolve 404", inexistente.status === 404, `${inexistente.status}`);

  /* ------------------------------------------------------------ etiquetas - */

  console.log("\n3) Etiquetas");
  const tagCriada = await req("POST", "/api/tags", { name: "__api_tag", color: "#123456" });
  check("POST /api/tags cria", tagCriada.status === 201, `${tagCriada.status}`);

  const dup = await req("POST", "/api/tags", { name: "__api_tag" });
  check("etiqueta duplicada devolve 409", dup.status === 409, `${dup.status}`);

  const semNome = await req("POST", "/api/tags", { name: "  " });
  check("nome vazio devolve 400", semNome.status === 400, `${semNome.status}`);

  const listaTags = await req("GET", "/api/tags");
  check("GET lista etiquetas", Array.isArray(listaTags.json) && listaTags.json.length > 0);

  const del = await req("DELETE", `/api/tags?id=${tagCriada.json.id}`);
  check("DELETE remove etiqueta", del.json.ok === true);

  const delSemId = await req("DELETE", "/api/tags");
  check("DELETE sem id devolve 400", delSemId.status === 400, `${delSemId.status}`);

  /* ------------------------------------------------------------ conexoes -- */

  console.log("\n4) Conexoes");
  const conns = await req("GET", "/api/connections");
  check("GET lista conexoes", Array.isArray(conns.json));

  const connCriada = await req("POST", "/api/connections", { name: "__api_conn" });
  check("POST cria conexao", connCriada.status === 201);

  const connSemNome = await req("POST", "/api/connections", { name: "" });
  check("conexao sem nome devolve 400", connSemNome.status === 400, `${connSemNome.status}`);

  const acaoInvalida = await req("POST", `/api/connections/${connCriada.json.id}`, {
    action: "voar",
  });
  check("acao invalida devolve 400", acaoInvalida.status === 400, `${acaoInvalida.status}`);

  const testeSemConexao = await req("POST", `/api/connections/${connCriada.json.id}`, {
    action: "test",
    phone: "5511999999999",
  });
  check(
    "testar numero em conexao desconectada devolve 400",
    testeSemConexao.status === 400,
    `${testeSemConexao.status}`,
  );

  const numeroInvalido = await req("POST", `/api/connections/${connCriada.json.id}`, {
    action: "test",
    phone: "123",
  });
  check("numero curto devolve 400", numeroInvalido.status === 400, `${numeroInvalido.status}`);

  await req("DELETE", `/api/connections/${connCriada.json.id}`);
  const aposDelete = await req("GET", "/api/connections");
  check(
    "DELETE remove a conexao",
    !aposDelete.json.some((c: any) => c.name === "__api_conn"),
  );

  /* ----------------------------------------------------------- conversas -- */

  console.log("\n5) Conversas");
  const todas = await req("GET", "/api/conversations");
  check("GET lista conversas", Array.isArray(todas.json));

  for (const s of ["aguardando", "atendendo", "resolvido"]) {
    const r = await req("GET", `/api/conversations?status=${s}`);
    check(`filtro status=${s}`, Array.isArray(r.json));
  }

  const convInexistente = await req("GET", "/api/conversations/00000000-0000-0000-0000-000000000000");
  check("conversa inexistente devolve 404", convInexistente.status === 404, `${convInexistente.status}`);

  if (todas.json.length > 0) {
    const id = todas.json[0].id;
    const detalhe = await req("GET", `/api/conversations/${id}`);
    check("GET conversa traz mensagens", Array.isArray(detalhe.json.messages));

    const toggle = await req("POST", `/api/conversations/${id}`, {
      action: "toggle_ai",
      value: false,
    });
    check("toggle_ai responde ok", toggle.json.ok === true);

    const status = await req("POST", `/api/conversations/${id}`, {
      action: "status",
      value: "atendendo",
    });
    check("mudar status responde ok", status.json.ok === true);

    // devolve ao estado anterior
    await req("POST", `/api/conversations/${id}`, { action: "toggle_ai", value: true });
    await req("POST", `/api/conversations/${id}`, { action: "status", value: "aguardando" });

    const vazia = await req("POST", `/api/conversations/${id}`, { action: "send", body: "  " });
    check("enviar mensagem vazia devolve 400", vazia.status === 400, `${vazia.status}`);
  } else {
    console.log("   (sem conversas no banco — pulando detalhes)");
  }

  /* ------------------------------------------------------------- webhook -- */

  console.log("\n6) Webhook de entrada");
  const hookInexistente = await req("POST", "/api/webhooks/nao-existe", {});
  check("slug inexistente devolve 404", hookInexistente.status === 404, `${hookInexistente.status}`);

  const hookSemPhone = await req("POST", "/api/webhooks/pagamento-aprovado", { valor: 10 });
  check(
    "webhook sem telefone devolve 400",
    hookSemPhone.status === 400,
    `${hookSemPhone.status}`,
  );

  const hookOk = await req("POST", "/api/webhooks/pagamento-aprovado", {
    phone: "5511900000901",
    nome: "Webhook",
    valor: 30,
  });
  check("webhook com telefone dispara o fluxo", hookOk.json.ok === true, JSON.stringify(hookOk.json));

  /* ----------------------------------------------------------------- dev -- */

  console.log("\n7) Simulador de entrada (dev)");
  const simVazio = await req("POST", "/api/dev/simulate", { phone: "5511900000902" });
  check("simulate sem texto devolve 400", simVazio.status === 400, `${simVazio.status}`);

  const simCurto = await req("POST", "/api/dev/simulate", { phone: "1", text: "oi" });
  check("simulate com numero curto devolve 400", simCurto.status === 400, `${simCurto.status}`);

  /* -------------------------------------------------------------- limpeza - */

  await req("DELETE", `/api/flows/${flowId}`);
  await req("DELETE", `/api/flows/${importado.json.id}`);

  console.log(
    `\n${failures === 0 ? "TODAS AS ROTAS PASSARAM" : `${failures} VERIFICACAO(OES) FALHARAM`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
