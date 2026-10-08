import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/*
 * Package boundaries, carried over from CuddleCue (CLAUDE.md §5).
 *
 *   apps/*      → packages/ui, packages/core, packages/brand, by package name only
 *   packages/ui → packages/core, packages/brand           never an app
 *   packages/core, packages/brand → nothing in the workspace, and never React, React Native,
 *                                   Expo or the Supabase client: they run in node and in tests.
 */
const reactAndFriends = [
  'react',
  'react/*',
  'react-*',
  'react-native',
  'react-native/*',
  'react-native-*',
  '@react-native/*',
  '@react-native-*/*',
  '@react-navigation/*',
  'expo',
  'expo/*',
  'expo-*',
  '@expo/*',
  '@supabase/*',
];
const anyApp = ['**/apps/**'];

const restrict = (group, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

const noColorLiteral = [
  {
    selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
    message: 'No hex literal in a component: read the color from useTheme().',
  },
  {
    selector: 'Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]',
    message: 'No color literal in a component: read the color from useTheme().',
  },
  {
    selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}/]',
    message: 'No hex literal in a component: read the color from useTheme().',
  },
];

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.expo/**',
    '**/.turbo/**',
    '**/coverage/**',
    'apps/mobile/ios/**',
    'apps/mobile/android/**',
    'prototype/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  /**
   * THE RULES OF HOOKS, AS ERRORS. CuddleCue shipped a crash that only a second render shows
   * (hooks added below an early return); `rules-of-hooks` is what catches it.
   */
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // packages/core cannot import React, so nothing in it can be a hook
    files: ['packages/core/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['**/*.cjs', 'apps/mobile/metro.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      ...restrict(
        [...reactAndFriends, ...anyApp, '@nibblecue/ui', '@nibblecue/brand'],
        'packages/core is pure TypeScript: no React, React Native, Expo, Supabase or other workspace packages.',
      ),
    },
  },
  {
    files: ['packages/brand/**/*.ts'],
    rules: restrict(
      [...reactAndFriends, ...anyApp, '@nibblecue/*'],
      'packages/brand is a leaf: it reads brand.json and nothing else.',
    ),
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: restrict(
      ['@supabase/*', ...anyApp],
      'packages/ui may import core and brand, never Supabase or an app.',
    ),
  },
  {
    // no component contains a color literal: tokens only, so a token change repaints the app
    files: ['packages/ui/src/components/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      // CuddleCue's four exceptions, each a palette that must NOT move with the theme (CuddleCue's
      // eslint.config.mjs says why for each): pixels sampled from card art, the pre-made babies'
      // and grown-ups' drawings, and Google's "G", which may only be drawn in its own colors
      'apps/mobile/src/ui/cardArt.generated.ts',
      'apps/mobile/src/media/avatars/art.ts',
      'apps/mobile/src/media/avatars/adults.ts',
      'apps/mobile/src/auth/providerMarks.art.ts',
    ],
    rules: { 'no-restricted-syntax': ['error', ...noColorLiteral] },
  },
  {
    files: ['apps/**/*.{ts,tsx,js,mjs,cjs}'],
    ignores: ['apps/mobile/app.config.ts'],
    rules: restrict(
      ['**/packages/**', ...anyApp],
      'Apps import workspace packages by name (@nibblecue/core, …), never by relative path.',
    ),
  },
]);
