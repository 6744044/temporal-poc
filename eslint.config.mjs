import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslintConfigPrettier from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOWED_NODE_BUILTINS = new Set(['assert']);

const restrictedWorkflowImports = builtinModules
  .filter((moduleName) => !ALLOWED_NODE_BUILTINS.has(moduleName))
  .flatMap((moduleName) => [moduleName, `node:${moduleName}`]);

export default [
  {
    ignores: ['deploy/**', 'lib/**', 'node_modules/**', 'results/**'],
  },
  {
    ...js.configs.recommended,
    files: ['src/**/*.ts', 'test/**/*.ts'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'object-shorthand': ['error', 'always'],
    },
  },
  {
    files: ['src/workflows.ts', 'src/workflows-*.ts', 'src/workflows/*.ts'],
    rules: {
      'no-restricted-imports': ['error', ...restrictedWorkflowImports],
    },
  },
  eslintConfigPrettier,
];
