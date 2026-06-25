// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Test files may use `any` for mocking and fixture setup, where strict typing
  // adds noise without catching real bugs.
  {
    files: ['**/__tests__/**', '**/*.{test,spec}.{ts,js}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
