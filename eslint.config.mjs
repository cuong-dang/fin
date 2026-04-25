import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Side-effect imports
            ["^\\u0000"],
            // Node builtins
            ["^node:"],
            // External packages (npm, scoped packages, workspace packages)
            ["^@?\\w"],
            // Internal alias (@/...)
            ["^@/"],
            // Relative
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/jsx-key": "error",
      "react/jsx-sort-props": [
        "error",
        { callbacksLast: true, reservedFirst: true },
      ],
    },
  },
];
