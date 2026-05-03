import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['src/generated/**', '.agents/skills/**']),
    {
        ignores: ['src/generated/**', '.agents/skills/**'],
        files: ['src/**/*.{js,mjs,cjs,ts,mts,cts}'],
        plugins: { js, tseslint },
        extends: ['js/recommended'],
        languageOptions: { globals: globals.node, parser: 'ts'},
    },
    tseslint.configs.recommended
]);