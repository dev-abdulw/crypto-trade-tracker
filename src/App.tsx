import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import Toaster from './components/Toaster';
import { toast } from './lib/toast';
import AppRoutes from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
  queryCache: new QueryCache({
    // Data load failures surface as a toast; queries with their own UI (prices) opt out.
    onError: (error, query) => {
      if (query.meta?.silent) return;
      toast(error instanceof Error ? error.message : String(error), 'error');
    },
  }),
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
