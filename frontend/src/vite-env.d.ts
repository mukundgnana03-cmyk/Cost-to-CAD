/// <reference types="vite/client" />
declare module "replicad-opencascadejs/src/replicad_with_exceptions.js" {
  const init: (options: Record<string, unknown>) => Promise<unknown>;
  export default init;
}
