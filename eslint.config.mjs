// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**', '.yarn/**']
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: globals.node
		},
		rules: {
			// Match TypeScript's own noUnusedParameters convention: a leading underscore marks a deliberately unused binding.
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
		}
	},
	// Formatting is owned by Prettier (`yarn format`); turn off every stylistic rule that would fight it.
	prettier
);
