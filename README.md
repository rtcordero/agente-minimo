# Un agente de programación mínimo

Código del artículo [Qué es un agente de IA para programar y cómo funciona](https://rubentejera.com/como-funciona-un-agente-de-programacion/).

Un agente de IA para programar, en menos de 100 líneas de JavaScript y sin dependencias: un modelo de lenguaje, tres herramientas (ejecutar los tests, leer un fichero y escribirlo) y un bucle. Usa un modelo abierto en local con [Ollama](https://ollama.com/), sin clave ni coste.

- `agente.mjs`: el agente completo.
- `proyecto/`: el proyecto sobre el que trabaja, con un fallo a propósito: el descuento de socio debería empezar en 100 € y el código usa `>` en lugar de `>=`, así que uno de sus dos tests falla.
- `test/agente.test.js`: prueba el bucle sin modelo, con un servidor falso que responde como Ollama siguiendo un guion. Comprueba que cada resultado vuelve al contexto y que el agente para a los diez pasos.

Es un juguete para ver las piezas, no para trabajar con él: las herramientas aceptan cualquier ruta, también `../`, y los tests del proyecto se ejecutan con tus permisos.

## Requisitos

- Node.js 24.22.3 o posterior (`.node-version`).
- Para ejecutarlo con un modelo: Docker. El artículo usó `ollama/ollama:0.40.16` con `llama3.2:3b` y `qwen3:4b`, en CPU.

## Tests

```bash
npm test
```

## Ejecutarlo con un modelo

El agente modifica el proyecto, así que trabaja sobre una copia, dentro de un contenedor que solo ve esa copia (`PROYECTO` es `/proyecto` por defecto):

```bash
cp -r proyecto /tmp/proyecto-agente
docker network create agente
docker run --rm -d --name ollama --network agente -v ollama:/root/.ollama ollama/ollama:0.40.16
docker exec ollama ollama pull qwen3:4b
docker run --rm --network agente -v "$PWD/agente.mjs:/agente.mjs:ro" -v /tmp/proyecto-agente:/proyecto node:24.22.3 \
  node /agente.mjs http://ollama:11434 qwen3:4b
docker stop ollama && docker network rm agente
```

Probado el 14-11-2026 con Ollama 0.40.16, `llama3.2:3b` y `qwen3:4b`. Con modelos pequeños, el resultado cambia mucho: en el artículo, `llama3.2:3b` propuso cambiar el test (también cuando se le pidió que no lo hiciera, y además citó una línea que no existe), y `qwen3:4b` arregló el fallo sin ejecutar los tests ni una vez.

## Cómo se ha hecho

Desarrollado con el enfoque [IA Limpia](https://rubentejera.com/que-es-la-ia-limpia/): un agente de IA escribe el código siguiendo los pasos del artículo, los tests validan cada paso y el resultado se revisa y se aprueba a mano antes de publicarlo.

## Licencia

MIT. Ver `LICENSE`.
