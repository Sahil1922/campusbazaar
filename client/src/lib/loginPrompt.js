import { createContext, useContext } from 'react';

/**
 * Opens the login popup for signed-out visitors.
 * openLogin({ next: '/listings/5', reason: 'Sign in to see item details.' })
 * After signing in, the visitor is taken to `next`.
 */
export const LoginPromptContext = createContext({ openLogin: () => {} });

export const useLoginPrompt = () => useContext(LoginPromptContext);
