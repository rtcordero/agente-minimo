// Un agente mínimo: un modelo, tres herramientas y un bucle.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OLLAMA = process.argv[2] ?? 'http://localhost:11434';
const MODELO = process.argv[3] ?? 'qwen3:4b';
const PROYECTO = process.env.PROYECTO ?? '/proyecto';

// 1. Las herramientas: lo único que el agente puede hacer en el mundo.
const herramientas = {
  ejecutar_tests: () => {
    try {
      return execSync('npm test 2>&1', { cwd: PROYECTO, encoding: 'utf8' });
    } catch (error) {
      return error.stdout; // un test en rojo no es un error del agente: es información
    }
  },
  leer_fichero: ({ ruta }) => readFileSync(`${PROYECTO}/${ruta}`, 'utf8'),
  escribir_fichero: ({ ruta, contenido }) => {
    writeFileSync(`${PROYECTO}/${ruta}`, contenido);
    return `Guardado ${ruta}`;
  },
};

// 2. Su descripción, para que el modelo sepa que existen y cómo pedirlas.
const fn = (name, description, properties = {}) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required: Object.keys(properties) } },
});
const DESCRIPCIONES = [
  fn('ejecutar_tests', 'Ejecuta los tests del proyecto y devuelve la salida.'),
  fn('leer_fichero', 'Devuelve el contenido de un fichero del proyecto.', { ruta: { type: 'string' } }),
  fn('escribir_fichero', 'Sustituye el contenido de un fichero del proyecto.', {
    ruta: { type: 'string' },
    contenido: { type: 'string' },
  }),
];

// 3. El contexto: todo lo que el modelo sabe está en esta lista.
const mensajes = [
  { role: 'system', content: 'Eres un agente de programación. Usa las herramientas. Los tests describen lo que debe hacer el código: no los cambies. Antes de escribir un fichero, léelo. Cuando los tests pasen, responde con un resumen breve.' },
  { role: 'user', content: 'Los tests de src/descuento.js fallan. Arréglalo.' },
];

// 4. El bucle: el modelo pide una herramienta, se ejecuta y el resultado vuelve al contexto.
for (let paso = 1; paso <= 10; paso++) {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: MODELO, stream: false, think: false, options: { temperature: 0, seed: 42 }, tools: DESCRIPCIONES, messages: mensajes }),
  });
  const { message } = await r.json();
  mensajes.push(message);
  if (!message.tool_calls?.length) {
    console.log(`Paso ${paso}: termina → ${message.content}`);
    break;
  }
  for (const llamada of message.tool_calls) {
    const { name, arguments: args } = llamada.function;
    const resultado = herramientas[name](args);
    console.log(`Paso ${paso}: ${name}(${args.ruta ?? ''}) → ${resultado.split('\n').find((l) => /fail|pass|Guardado|export|✖/.test(l)) ?? resultado.split('\n')[0]}`);
    mensajes.push({ role: 'tool', content: resultado });
  }
}
console.log(`Mensajes en el contexto al final: ${mensajes.length}`);
