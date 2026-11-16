// Reports and complaints (UC-10 View Reports, UC-11 Remove Inappropriate Listings / Handle Complaints)
// — real API since Sprint 3. The server enforces the administrator role.
// Reasons must match the server's lists (docs/business-rules.md).
import { api } from '../api.js';

export const REPORT_REASONS = ['Prohibited item', 'Fake or misleading', 'Spam', 'Offensive content', 'Other'];
export const COMPLAINT_REASONS = ['Item not as described', 'Seller did not show up', 'Rude or unsafe behaviour', 'Other'];

export async function submitReport(_me, { listingId, reportedUserId, reason, description }) {
  await api('/reports', { method: 'POST', body: { listingId, reportedUserId, reason, description } });
}

export async function submitComplaint(_me, { listingId, reason }) {
  await api('/complaints', { method: 'POST', body: { listingId, reason } });
}

export async function listReports(_me, { status = 'open' } = {}) {
  const data = await api(`/admin/reports?status=${encodeURIComponent(status)}`);
  return data.reports;
}

export async function listComplaints(_me, { status = 'open' } = {}) {
  const data = await api(`/admin/complaints?status=${encodeURIComponent(status)}`);
  return data.complaints;
}

export async function resolveReport(_me, reportId, { removeListing = false, note } = {}) {
  await api(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { method: 'POST', body: { removeListing, note } });
}

export async function resolveComplaint(_me, complaintId, { removeListing = false, note } = {}) {
  await api(`/admin/complaints/${encodeURIComponent(complaintId)}/resolve`, { method: 'POST', body: { removeListing, note } });
}
