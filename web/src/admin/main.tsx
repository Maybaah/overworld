import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-mono/400.css';
import '../ui/tokens.css';
import './admin.css';
import { Admin } from './Admin';

createRoot(document.getElementById('admin')!).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
