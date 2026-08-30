import { classifyLocally } from "../src/lib/flow/local-classifier";
import type { AISmartCondition } from "../src/lib/flow/node-types";

/** Confere o classificador local contra as frases que um lead manda de verdade. */
const conds: AISmartCondition[] = [
  { priority: 1, prompt: "O cliente demonstrou interesse ou disse algo como ok, quero sim, pode enviar", outputKey: "#positivo" },
  { priority: 2, prompt: "O cliente demonstrou falta de interesse, disse nao quero ou nao tenho interesse", outputKey: "#negativo" },
  { priority: 3, prompt: "O cliente perguntou sobre preco, valor ou disse que esta caro", outputKey: "#preco" },
];

const casos: [string, string | null][] = [
  ["quero sim", "#positivo"],
  ["pode enviar", "#positivo"],
  ["ok", "#positivo"],
  ["nao quero", "#negativo"],
  ["qual o preco?", "#preco"],
  ["ta muito caro", "#preco"],
  ["quanto e o valor", "#preco"],
  ["oi tudo bem", null],
  ["me manda af", null],
  ["n quero nao", "#negativo"],
  ["nao tenho interesse", "#negativo"],
  ["pode sim", "#positivo"],
];

let fails = 0;
for (const [texto, esperado] of casos) {
  const r = classifyLocally(texto, conds, "Voce e uma atendente simpatica de uma loja de receitas para diabeticos.");
  const ok = r.outputKey === esperado;
  if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FALHOU"}  "${texto}" -> ${r.outputKey ?? "FALLBACK"} (esperado ${esperado ?? "FALLBACK"}, score ${r.score})`);
}
console.log(fails === 0 ? "\nclassificador OK" : `\n${fails} caso(s) divergiram`);
process.exit(fails === 0 ? 0 : 1);
