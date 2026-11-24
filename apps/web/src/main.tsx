import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { DevtoolsGuard } from '@/components/guard/DevtoolsGuard';
import { PointerFx } from '@/components/fx/PointerFx';
import { SlideIndicators } from '@/components/fx/SlideIndicators';
import { BackToTop } from '@/components/fx/BackToTop';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import '@/styles/kaned.css';
import '@/styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <DevtoolsGuard />
            <PointerFx />
            <SlideIndicators />
            <BackToTop />
            <AnnouncementBar />
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
