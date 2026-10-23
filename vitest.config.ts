import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// The tests run in real Chromium, so WebGL, layout and pointer events are the browser's own.
// SwiftShader renders WebGL on machines without a GPU, such as CI runners.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
      }),
      instances: [{ browser: 'chromium' }],
      viewport: { width: 1280, height: 800 },
    },
  },
})
