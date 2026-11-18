export default {
  stories: ['../stories/*.stories.js'],
  framework: { name: '@storybook/vue3-vite', options: { docgen: false } },
  core: { disableTelemetry: true },
};
