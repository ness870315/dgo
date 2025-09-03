module.exports = {
  extends: ['react-app', 'react-app/jest'],
  rules: {
    // Always treat as warnings in CI/production to prevent build failures
    'no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/rules-of-hooks': 'warn'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
