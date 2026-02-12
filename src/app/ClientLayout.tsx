'use client';

import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { RoleProvider } from './context/adminContext';
import './utils/firebaseConsoleHelper';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Importar los scripts de Bootstrap de forma dinámica en el cliente
    import('bootstrap/dist/js/bootstrap.bundle.min.js').catch(console.error);
  }, []);

  return (
    <AuthProvider>
      <RoleProvider>
        {children}
      </RoleProvider>
    </AuthProvider>
  );
}