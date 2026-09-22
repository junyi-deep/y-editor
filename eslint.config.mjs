import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default ts.config(
  { ignores: ['artifacts/**', 'dist/**', 'node_modules/**', 'public/vendor/**', 'src-tauri/**', 'resources/**', '.codegraph/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    // Vendored shadcn component source keeps its upstream file names (Select,
    // Dialog, …); renaming would break every future `shadcn-vue add`.
    files: ['src/components/ui/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', File: 'readonly', FileReader: 'readonly', Element: 'readonly', HTMLImageElement: 'readonly', ClipboardEvent: 'readonly', DragEvent: 'readonly', MouseEvent: 'readonly', MutationObserver: 'readonly', IntersectionObserver: 'readonly', HTMLElement: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
    rules: { 'no-undef': 'off', '@typescript-eslint/no-explicit-any': 'error' },
  },
  { files: ['scripts/*.mjs'], languageOptions: { globals: { URL: 'readonly', console: 'readonly', fetch: 'readonly', Buffer: 'readonly', setTimeout:'readonly', clearTimeout:'readonly', process: 'readonly', WebSocket: 'readonly' } } },
);
