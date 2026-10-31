'use client';

import React from 'react';
import { AuthProvider } from './AuthContext';
import { AuthModal } from './AuthModal';

export const ClientAuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      {children}
      <AuthModal />
    </AuthProvider>
  );
};
