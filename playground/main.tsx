import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './app.css';
import { DEFAULT_THEME, applyTheme } from './pierreThemes';

// Paint the theme variables before the first render so nothing flashes unstyled.
applyTheme(DEFAULT_THEME);

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
