import { client } from './client';

// The fixed 5-shift catalog — static reference data served by an
// unauthenticated backend endpoint (not HR-scoped, hence its own file
// instead of api/hr.js). Callers should fetch it once with a long/infinite
// staleTime since it never changes within a session.
export const getShiftCatalog = async () => {
  const { data } = await client.get('/shifts');
  return data.data;
};
