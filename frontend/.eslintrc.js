module.exports = {
  extends: ['react-app', 'react-app/jest'],
  rules: {
    // Disable unused variables warnings during build
    'no-unused-vars': process.env.NODE_ENV === 'production' ? 'warn' : 'error',
    // Disable exhaustive deps warnings during build
    'react-hooks/exhaustive-deps': process.env.NODE_ENV === 'production' ? 'warn' : 'error'
  }
};
