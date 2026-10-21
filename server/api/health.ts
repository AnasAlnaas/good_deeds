// GET /api/health — lets the mobile app (and us) check the API is up.
export function GET(): Response {
  return Response.json({ ok: true, service: "good-deeds-api", time: new Date().toISOString() });
}
