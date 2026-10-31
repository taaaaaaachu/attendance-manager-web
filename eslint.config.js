import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default ts.config(
  {
    // 生成物は対象外。
    ignores: [
      '**/dist/',
      '**/dev-dist/',
      '**/.wrangler/',
      '**/node_modules/',
      'workers/api/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['apps/web/**/*.{ts,tsx}'],
  },
);
