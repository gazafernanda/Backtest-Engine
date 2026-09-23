import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    plugins: [react()],
    /**
     * GitHub Pages serves a project site from /<repo>/, so built assets need
     * that prefix. The dev server still runs at the root.
     */
    base: command === 'build' ? '/Backtest-Engine/' : '/',
    server: {
        port: 5173,
        open: true,
    },
}));
