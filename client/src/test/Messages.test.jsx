import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seller = { id: 1, name: 'Asha Verma', roles: ['buyer', 'seller'] };
const listeners = new Set();

vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: seller }) }));
vi.mock('../lib/socket.js', () => ({
  onMessagesChanged: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));
vi.mock('../services/messages.js', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
}));

const messages = await import('../services/messages.js');
const { default: Messages } = await import('../pages/Messages.jsx');

const at = (minutes) => new Date(Date.UTC(2026, 10, 16, 12, minutes)).toISOString();
const thread = (items) => ({
  listing: { id: 4, title: 'Casio calculator', price: 850, status: 'active' },
  otherName: 'Priya Sharma',
  canSend: true,
  messages: items,
});
const first = { id: 1, content: 'Is it still available?', sentAt: at(0), isMine: false };
const reply = { id: 2, content: 'Can we meet at 4?', sentAt: at(5), isMine: false };
const conversation = (last) => [
  { listingId: 4, buyerId: 2, listingTitle: 'Casio calculator', otherName: 'Priya Sharma', role: 'selling', unread: false, lastMessage: { ...last, senderId: 2 } },
];

/** Simulates the server's Socket.IO "messages:changed" event. */
const serverSays = async (change) => {
  await act(async () => {
    for (const listener of [...listeners]) listener(change);
  });
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/messages/4/2']}>
      <Routes>
        <Route path="/messages/:listingId/:buyerId" element={<Messages />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('live messages (UC-05)', () => {
  beforeEach(() => {
    listeners.clear();
    messages.listConversations.mockReset();
    messages.getConversation.mockReset();
  });

  it('shows a new reply in the open conversation without a page refresh', async () => {
    messages.getConversation.mockResolvedValueOnce(thread([first])).mockResolvedValueOnce(thread([first, reply]));
    messages.listConversations.mockResolvedValueOnce(conversation(first)).mockResolvedValueOnce(conversation(reply));
    renderPage();
    expect(await screen.findByText('Is it still available?', { selector: '.bubble' })).toBeInTheDocument();
    expect(screen.queryByText('Can we meet at 4?')).not.toBeInTheDocument();

    await serverSays({ listingId: 4, buyerId: 2 });

    expect(await screen.findByText('Can we meet at 4?', { selector: '.bubble' })).toBeInTheDocument();
    expect(messages.getConversation).toHaveBeenCalledTimes(2);
    expect(messages.listConversations).toHaveBeenCalledTimes(2);
  });

  it('refreshes only the conversation list for changes in other conversations', async () => {
    messages.getConversation.mockResolvedValue(thread([first]));
    messages.listConversations.mockResolvedValue(conversation(first));
    renderPage();
    await screen.findByText('Is it still available?', { selector: '.bubble' });

    await serverSays({ listingId: 9, buyerId: 7 });

    expect(messages.getConversation).toHaveBeenCalledTimes(1);
    expect(messages.listConversations).toHaveBeenCalledTimes(2);
  });
});
