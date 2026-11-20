import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DemoBar } from './demo/DemoBar';
import { DEMO } from './demo/flag';
import { Toaster } from './components/ui/Toaster';
import { TooltipProvider } from './components/ui/Tooltip';
import { getLocale, loadLocale } from './i18n';
import { queryClient } from './lib/query';
import './fonts';
import './styles.css';

// First paint in the browser's language: its strings load before the app renders.
void loadLocale(getLocale()).finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
        {DEMO && <DemoBar />}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
));
