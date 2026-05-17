import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import vitestPlugin from '@vitest/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'drizzle/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    plugins: { sonarjs },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      eqeqeq: 'error',
      'no-template-curly-in-string': 'error',
      'array-callback-return': 'error',
      'no-else-return': 'error',
      'max-depth': ['error', 4],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    plugins: { vitest: vitestPlugin },
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'vitest/unbound-method': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  eslintConfigPrettier,
);
