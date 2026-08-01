import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslintConfigPrettier,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['ios/**', 'dist/**', 'android/**', 'node_modules/**'],
  },
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@platform/modules/*'],
              message: 'Use @platform/ui or eventBus — not @platform/modules from game layer',
            },
          ],
          paths: [
            {
              name: '@platform/core/advertising',
              message: 'Use eventBus for ad interactions',
            },
            {
              name: '@platform/core/config',
              message: 'Use @game/config for game settings',
            },
            {
              name: '@platform/core/utils',
              message: 'Use @game/utils for game utilities',
            },
            {
              name: '@platform/core/error',
              message: 'Use eventBus.emit("error:report", ...) instead',
            },
            {
              name: '@platform/core/state',
              message: 'Game layer must not mutate store — use eventBus',
            },
            {
              name: '@platform/core/storage',
              message: 'Game layer must not access storage — use eventBus',
            },
            {
              name: '@platform/core/api',
              message: 'Game layer must not call API directly — use eventBus',
            },
            {
              name: '@platform/core/analytics',
              message:
                'Use eventBus.emit("analytics", ...) with AnalyticsEvents from @platform/core/events',
            },
          ],
        },
      ],
    },
  }
);
