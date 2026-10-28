import { runSync } from "./engine.js";

runSync()
  .then((state) => {
    console.log(
      `Sincronizacion completada: ${state.stats.total} hallazgos, ` +
        `${state.stats.urgentes} urgentes, ${state.stats.actualizaciones} actualizaciones.`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error de sincronizacion:", error.message);
    process.exit(1);
  });
