/**
 * Minimal Server-Sent Events hub. Broadcasts public, non-sensitive counters
 * (likes / comments / new posts) and per-user notification pings so every open
 * tab updates its DOM in real time without polling.
 */
const clients = new Set();

function subscribe(req, res, userId = null) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  const client = { res, userId };
  clients.add(client);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
}

function send(client, event, data) {
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const client of clients) send(client, event, data);
}

function notifyUser(userId, event, data) {
  const id = userId.toString();
  for (const client of clients) if (client.userId === id) send(client, event, data);
}

module.exports = { subscribe, broadcast, notifyUser, clients };
