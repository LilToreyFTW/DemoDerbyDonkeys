const rooms = globalThis.__donkeyDerbyRooms ?? new Map();
globalThis.__donkeyDerbyRooms = rooms;

const maxAge = 12000;

export default async function handler(request, response) {
  response.setHeader("cache-control", "no-store");

  if (request.method === "POST") {
    const state = request.body && typeof request.body === "object" ? request.body : await readJson(request);
    if (!state?.roomId || !state?.id) {
      response.status(400).json({ error: "roomId and id are required" });
      return;
    }

    const room = rooms.get(state.roomId) ?? new Map();
    room.set(state.id, { ...state, updatedAt: Date.now() });
    rooms.set(state.roomId, room);
    pruneRoom(room);
    response.status(200).json({ ok: true, players: room.size });
    return;
  }

  if (request.method === "GET") {
    const roomId = request.query?.roomId;
    const playerId = request.query?.playerId;
    const room = rooms.get(roomId) ?? new Map();
    pruneRoom(room);
    const players = [...room.values()].filter((player) => player.id !== playerId);
    response.status(200).json({ players });
    return;
  }

  response.setHeader("allow", "GET, POST");
  response.status(405).json({ error: "Method not allowed" });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function pruneRoom(room) {
  const cutoff = Date.now() - maxAge;
  for (const [id, state] of room) {
    if (state.updatedAt < cutoff) room.delete(id);
  }
}
