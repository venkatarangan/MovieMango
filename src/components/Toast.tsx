import { Alert, Button, Snackbar } from '@mui/material';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Severity = 'success' | 'info' | 'warning' | 'error';
/** An optional button on the toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}
type Show = (message: string, severity?: Severity, action?: ToastAction) => void;
const ToastContext = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; severity: Severity; action?: ToastAction; key: number } | null>(null);
  const show = useCallback<Show>((message, severity = 'success', action) => setToast({ message, severity, action, key: Date.now() }), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar
        key={toast?.key}
        open={!!toast}
        autoHideDuration={toast?.action ? 6000 : 3500}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
      >
        <Alert
          severity={toast?.severity ?? 'success'}
          variant="filled"
          onClose={() => setToast(null)}
          action={
            toast?.action ? (
              <Button
                color="inherit"
                size="small"
                sx={{ fontWeight: 700 }}
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </Button>
            ) : undefined
          }
          sx={{ width: '100%', alignItems: 'center' }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
