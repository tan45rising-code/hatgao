import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // src/server must never import from src/app — business logic stays
      // free of HTTP/Next.js concerns and testable in isolation.
      // (Enforced properly via eslint-plugin-boundaries once the server
      // layer exists in Phase 1; noted here as a placeholder.)
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "prisma/migrations/**"],
  },
];

export default eslintConfig;
