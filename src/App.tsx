import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import AppRoutes from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
