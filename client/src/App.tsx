import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toaster';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/home';
import { useToast } from './hooks/use-toast';
import { useIsMobile } from './hooks/use-mobile';
import { ThemeProvider } from './components/theme-provider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Network connection restored",
        description: "You can now continue working with documents",
        variant: "default",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "Network connection lost",
        description: "Some features may be limited",
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <div className={`min-h-screen flex flex-col ${isMobile ? 'text-sm' : ''}`}>
          <Header isOnline={isOnline} />
          <main className="flex-grow container mx-auto px-4 py-6">
            <Home />
          </main>
          <Footer />
        </div>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
