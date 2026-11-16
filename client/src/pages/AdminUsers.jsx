import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const formatDate = (value) => new Date(value).toLocaleDateString();

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [query, setQuery] = useState({ search: '', status: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    const params = new URLSearchParams({ page: String(query.page) });
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    api(`/admin/users?${params}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [query]);

  useEffect(load, [load]);

  const handleSearch = (event) => {
    event.preventDefault();
    setQuery({ ...filters, page: 1 });
  };

  const changeStatus = async (target, status) => {
    const verb = status === 'suspended' ? 'Suspend' : 'Reactivate';
    const note = window.prompt(`${verb} ${target.name}? Optionally enter a reason for the record:`, '');
    if (note === null) return; // Cancelled.
    setBusyId(target.id);
    setActionMessage(null);
    try {
      const result = await api(`/admin/users/${target.id}/status`, {
        method: 'PATCH',
        body: note.trim() ? { status, note: note.trim() } : { status },
      });
      setData((d) => ({ ...d, users: d.users.map((u) => (u.id === target.id ? result.user : u)) }));
      setActionMessage({ type: 'success', text: `${target.name} is now ${result.user.accountStatus}.` });
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="card">
      <h1>Manage users</h1>
      <form className="toolbar" onSubmit={handleSearch} role="search">
        <label className="sr-only" htmlFor="user-search">
          Search by name or email
        </label>
        <input
          id="user-search"
          type="search"
          placeholder="Search by name or email"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <label className="sr-only" htmlFor="user-status">
          Status
        </label>
        <select
          id="user-status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {actionMessage && (
        <p className={actionMessage.type === 'error' ? 'form-error' : 'form-success'} role="status">
          {actionMessage.text}
        </p>
      )}

      {error ? (
        <div>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="button" className="button" onClick={load}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="muted">Loading users…</p>
      ) : data.users.length === 0 ? (
        <p className="muted">No users match these filters.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  const isAdmin = u.roles.includes('admin');
                  return (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td className="break">{u.email}</td>
                      <td>{u.roles.join(', ')}</td>
                      <td>
                        <span className={`status status-${u.accountStatus}`}>{u.accountStatus}</span>
                      </td>
                      <td>{formatDate(u.createdAt)}</td>
                      <td>
                        {isSelf || isAdmin ? (
                          <span className="muted small">{isSelf ? 'You' : 'Administrator'}</span>
                        ) : u.accountStatus === 'active' ? (
                          <button
                            type="button"
                            className="button button-small button-outline-danger"
                            disabled={busyId === u.id}
                            onClick={() => changeStatus(u, 'suspended')}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button-small"
                            disabled={busyId === u.id}
                            onClick={() => changeStatus(u, 'active')}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Pages">
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={query.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
            >
              Previous
            </button>
            <span className="muted small">
              Page {data.page} of {totalPages} · {data.total} users
            </span>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={query.page >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
