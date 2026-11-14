// Un agente mínimo: un modelo, tres herramientas y un bucle.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OLLAMA = process.argv[2] ?? 'http://localhost:11434';
const MODELO = process.argv[3] ?? 'qwen3:4b';
const PROYECTO = process.env.PROYECTO ?? '/proyecto';
const MAX_PASOS = 10;

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
// Cada nombre aparece dos veces; un agente real genera las dos cosas de una sola definición.
const describir = (name, description, properties = {}) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties, required: Object.keys(properties) },
  },
});
const DESCRIPCIONES = [
  describir('ejecutar_tests', 'Ejecuta los tests del proyecto y devuelve la salida.'),
  describir('leer_fichero', 'Devuelve el contenido de un fichero del proyecto.', {
    ruta: { type: 'string' },
  }),
  describir('escribir_fichero', 'Sustituye el contenido de un fichero del proyecto.', {
    ruta: { type: 'string' },
    contenido: { type: 'string' },
  }),
];

// 3. El contexto: todo lo que el modelo sabe está en esta lista.
const INSTRUCCIONES = [
  'Eres un agente de programación. Usa las herramientas.',
  'Los tests describen lo que debe hacer el código: no los cambies.',
  'Antes de escribir un fichero, léelo.',
  'Cuando los tests pasen, responde con un resumen breve.',
].join(' ');
const mensajes = [
  { role: 'system', content: INSTRUCCIONES },
  { role: 'user', content: 'Los tests de src/descuento.js fallan. Arréglalo.' },
];

// Una línea de la salida de cada herramienta, para seguir el paso por pantalla.
const resumir = (resultado) => {
  const lineas = resultado.split('\n');
  return lineas.find((linea) => /fail|pass|Guardado|export|✖/.test(linea)) ?? lineas[0];
};

// 4. El bucle: el modelo pide una herramienta, se ejecuta y el resultado vuelve al contexto.
for (let paso = 1; paso <= MAX_PASOS; paso++) {
  const respuesta = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model: MODELO,
      messages: mensajes,
      tools: DESCRIPCIONES,
      stream: false,
      think: false,
      options: { temperature: 0, seed: 42 },
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Ollama respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
  const { message } = await respuesta.json();
  mensajes.push(message);
  if (!message.tool_calls?.length) {
    console.log(`Paso ${paso}: termina → ${message.content}`);
    break;
  }
  for (const llamada of message.tool_calls) {
    const { name, arguments: args } = llamada.function;
    const resultado = herramientas[name](args);
    console.log(`Paso ${paso}: ${name}(${args.ruta ?? ''}) → ${resumir(resultado)}`);
    mensajes.push({ role: 'tool', tool_name: name, content: resultado });
  }
}
console.log(`Mensajes en el contexto al final: ${mensajes.length}`);
