import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts",
    headless: "src/headless/run.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __janetCreateRequire } from "node:module";\nconst require = __janetCreateRequire(import.meta.url);',
  },
  // Keep node_modules external — this is a CLI installed with its deps, not a bundle.
  skipNodeModulesBundle: true,
});
