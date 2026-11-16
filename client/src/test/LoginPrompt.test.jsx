import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));

const { api, ApiError } = await import('../api.js');
const { AuthProvider } = await import('../auth.jsx');
const { default: LoginPromptProvider } = await import('../components/LoginPrompt.jsx');
const { useLoginPrompt } = await import('../lib/loginPrompt.js');

const student = { id: 2, name: 'Priya Sharma', email: 'priya@uohyd.ac.in', roles: ['buyer', 'seller'] };

function OpenButton() {
  const { openLogin } = useLoginPrompt();
  return (
    <button type="button" onClick={() => openLogin({ next: '/listings/5', reason: 'Sign in to see this item.' })}>
      Open item
    </button>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <LoginPromptProvider>
          <Routes>
            <Route path="/" element={<OpenButton />} />
            <Route path="/listings/5" element={<p>Item page</p>} />
            <Route path="/register" element={<p>Register page</p>} />
          </Routes>
        </LoginPromptProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('login popup for signed-out visitors', () => {
  // Braces matter: a function returned from beforeEach would be run by Vitest as a cleanup hook.
  beforeEach(() => {
    api.mockReset();
  });

  function signedOut({ signIn } = {}) {
    api.mockImplementation(async (path, options) => {
      if (path === '/auth/me') throw new ApiError(401, 'Please sign in to continue.');
      if (path === '/auth/sign-in') return signIn(options.body);
      throw new Error(`unexpected ${path}`);
    });
  }

  it('opens with the reason, then signs in and continues to the item', async () => {
    const user = userEvent.setup();
    signedOut({ signIn: async () => ({ user: student }) });
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Open item' }));

    const dialog = screen.getByRole('dialog', { name: 'Login' });
    expect(dialog).toHaveTextContent('Sign in to see this item.');
    await user.type(screen.getByLabelText('University email'), 'priya@uohyd.ac.in');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Item page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/auth/sign-in', {
      method: 'POST',
      body: { email: 'priya@uohyd.ac.in', password: 'a-strong-password' },
    });
  });

  it('shows the server error for a wrong password and stays open', async () => {
    const user = userEvent.setup();
    signedOut({
      signIn: async () => {
        throw new ApiError(401, 'Email or password is incorrect.');
      },
    });
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Open item' }));
    await user.type(screen.getByLabelText('University email'), 'priya@uohyd.ac.in');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes with Escape and links to registration', async () => {
    const user = userEvent.setup();
    signedOut({ signIn: async () => ({ user: student }) });
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Open item' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open item' }));
    await user.click(screen.getByRole('link', { name: /create an account/i }));
    expect(await screen.findByText('Register page')).toBeInTheDocument();
  });

  it('goes straight to the item when the visitor is already signed in', async () => {
    const user = userEvent.setup();
    api.mockImplementation(async (path) => {
      if (path === '/auth/me') return { user: student };
      throw new Error(`unexpected ${path}`);
    });
    renderApp();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/auth/me'));
    await user.click(await screen.findByRole('button', { name: 'Open item' }));
    expect(await screen.findByText('Item page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
