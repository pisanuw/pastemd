// ESLint 9 flat config: the recommended rules, with browser globals for the
// page scripts (classic scripts, not modules) and Node globals for the
// functions, the tests and this file.
import js from "@eslint/js";
import globals from "globals";

export default [
  // hw-events.js is the platform's copy, byte for byte (test/analytics.test.mjs).
  { ignores: ["hw-events.js", ".netlify/"] },
  js.configs.recommended,
  {
    files: ["static/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["netlify/**/*.mjs", "test/**/*.mjs", "eslint.config.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
];
