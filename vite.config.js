import { defineConfig } from 'vite';

// Two entry points (main + the /wallet subpath), each emitted as ESM and CJS.
// Zero runtime dependencies, so nothing is externalised — the crypto core is
// bundled in. `node:crypto` is never imported (we use Web Crypto), so there is
// no Node built-in to mark external.
export default defineConfig({
	build: {
		target: 'es2021',
		minify: false,
		sourcemap: true,
		lib: {
			entry: {
				index: 'src/index.js',
				wallet: 'src/wallet.js',
			},
			formats: ['es', 'cjs'],
			// `.esm.js` is ESM under the package's "type": "module"; CJS uses the
			// `.cjs` extension so Node always treats it as CommonJS regardless of
			// the package type field.
			fileName: (format, name) => (format === 'es' ? `${name}.esm.js` : `${name}.cjs`),
		},
		rollupOptions: {
			output: {
				// Keep the shared crypto chunk readable and deterministic.
				chunkFileNames: 'chunks/[name].[format].js',
				// Named CJS exports (withX402, wrapFetchWithPayment, privateKeyToWallet)
				// without a `.default` interop wrapper.
				exports: 'named',
			},
		},
	},
});
