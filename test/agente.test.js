// Prueba el bucle del agente sin modelo: un servidor falso responde como Ollama, con un guion fijo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const raiz = join(import.meta.dirname, '..');
const CODIGO_ARREGLADO = readFileSync(join(raiz, 'proyecto/src/descuento.js'), 'utf8').replace('total > 100', 'total >= 100');

const llamada = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

// Arranca un Ollama falso que devuelve las respuestas del guion, una por petición, y guarda lo que recibe.
async function ollamaFalso(guion) {
  const peticiones = [];
  const servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (trozo) => (cuerpo += trozo));
    req.on('end', () => {
      peticiones.push(JSON.parse(cuerpo));
      res.end(JSON.stringify({ message: guion[peticiones.length - 1] }));
    });
  });
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  return { url: `http://127.0.0.1:${servidor.address().port}`, peticiones, cerrar: () => servidor.close() };
}

async function ejecutarAgente(guion) {
  const proyecto = mkdtempSync(join(tmpdir(), 'proyecto-'));
  cpSync(join(raiz, 'proyecto'), proyecto, { recursive: true });
  const ollama = await ollamaFalso(guion);
  try {
    // Sin NODE_TEST_CONTEXT, el `npm test` del proyecto corre como si lo lanzara una persona.
    const { NODE_TEST_CONTEXT, ...entorno } = process.env;
    const { stdout } = await promisify(execFile)('node', [join(raiz, 'agente.mjs'), ollama.url, 'modelo-falso'], {
      env: { ...entorno, PROYECTO: proyecto },
    });
    return { stdout, proyecto, peticiones: ollama.peticiones };
  } finally {
    ollama.cerrar();
  }
}

test('cada resultado de una herramienta vuelve al contexto del modelo', async () => {
  const { stdout, proyecto, peticiones } = await ejecutarAgente([
    llamada('ejecutar_tests'),
    llamada('leer_fichero', { ruta: 'src/descuento.js' }),
    llamada('escribir_fichero', { ruta: 'src/descuento.js', contenido: CODIGO_ARREGLADO }),
    llamada('ejecutar_tests'),
    { role: 'assistant', content: 'Cambiado > por >=; los tests pasan.' },
  ]);

  assert.equal(peticiones.length, 5);
  assert.match(peticiones[1].messages.at(-1).content, /fail 1/);
  assert.match(peticiones[4].messages.at(-1).content, /fail 0/);
  assert.equal(readFileSync(join(proyecto, 'src/descuento.js'), 'utf8'), CODIGO_ARREGLADO);
  assert.match(stdout, /Paso 5: termina → Cambiado > por >=; los tests pasan\./);
});

test('el agente para a los diez pasos aunque el modelo no termine', async () => {
  const { stdout, peticiones } = await ejecutarAgente(Array.from({ length: 12 }, () => llamada('ejecutar_tests')));

  assert.equal(peticiones.length, 10);
  assert.doesNotMatch(stdout, /termina/);
});
