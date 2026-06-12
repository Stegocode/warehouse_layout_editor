// Flat ESLint config. The app modules run in the browser; the tests run in Node.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['app/vendor/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['app/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/js/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
