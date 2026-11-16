// Public home page data for signed-out visitors: card details only (no seller information).
import { api } from '../api.js';

export async function getPublicHome() {
  return api('/public/home');
}
