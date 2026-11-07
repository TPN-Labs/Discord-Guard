import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		// Undo vi.stubEnv / vi.spyOn after every test so no test leaks state into the next.
		restoreMocks: true,
		unstubEnvs: true
	}
});
