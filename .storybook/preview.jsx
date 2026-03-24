import '../src/index.css';
import { I18nProvider } from '../src/i18n/I18nContext';
import { ThemeProvider } from '../src/theme/ThemeContext';

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <I18nProvider>
          <div className="p-4">
            <Story />
          </div>
        </I18nProvider>
      </ThemeProvider>
    ),
  ],
};

export default preview;
