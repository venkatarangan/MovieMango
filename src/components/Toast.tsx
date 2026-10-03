import { Alert, Snackbar } from '@mui/material';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Severity = 'success' | 'info' | 'warning' | 'error';
const ToastContext = createContext<(message: string, severity?: Severity) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; severity: Severity; key: number } | null>(null);
  const show = useCallback((message: string, severity: Severity = 'success') => setToast({ message, severity, key: Date.now() }), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar
        key={toast?.key}
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
      >
        <Alert severity={toast?.severity ?? 'success'} variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
