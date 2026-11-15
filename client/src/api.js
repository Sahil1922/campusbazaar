export class ApiError extends Error {
  constructor(status, message, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }

  /** Field-level messages keyed by field name, for showing beside form inputs. */
  get fieldErrors() {
    const errors = {};
    for (const { field, message } of this.details ?? []) {
      if (field && !errors[field]) errors[field] = message;
    }
    return errors;
  }
}

/** Calls the CampusBazaar API. The session lives in an HttpOnly cookie, never in JavaScript. */
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach CampusBazaar. Check your connection and try again.');
  }

  if (response.status === 204) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response; fall through to the generic message below.
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'Something went wrong. Please try again.', data?.details);
  }
  return data;
}
