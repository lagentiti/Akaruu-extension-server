import WebSocket, { WebSocketServer } from 'ws';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
const BROADCASTER_USERNAME = process.env.BROADCASTER_USERNAME!;
const USER_ACCESS_TOKEN = process.env.TWITCH_OAUTH_TOKEN!;

let reconnectTimeout: NodeJS.Timeout | null = null;

const chromeClients: Set<WebSocket> = new Set();

const wss = new WebSocketServer({ port: 8080 });
console.log('📡 Serveur WebSocket local démarré sur ws://localhost:8080');

wss.on('connection', (socket) => {
  console.log('🔌 Extension Chrome connectée');
  chromeClients.add(socket);

  socket.on('message', (msg) => {
    console.log('📩 Message de l’extension :', msg.toString());
  });

  socket.on('close', () => {
    console.log('❌ Extension déconnectée');
    chromeClients.delete(socket);
  });

  socket.on('error', (err) => {
    console.error('⚠️ Erreur WebSocket (Chrome) :', err.message);
  });
});

function broadcastToExtensions(message: string) {
  for (const client of chromeClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

async function connectToEventSubWS() {
  const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

  ws.on('open', () => {
    console.log('✅ Connecté à Twitch EventSub WebSocket');
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.metadata?.message_type) {
      case 'session_welcome': {
        const sessionId = msg.payload.session.id;
        console.log('🎉 Session ID :', sessionId);

        try {
          await subscribeToStreamOnline(sessionId);
        } catch (err: any) {
          console.error('❌ Erreur d’abonnement :', err.response?.data || err.message);
        }
        break;
      }

      case 'notification': {
        const event = msg.payload.event;
        const streamer = event.broadcaster_user_name;
        const message = `🔴 ${streamer} est en live !`;
        console.log(message);
        broadcastToExtensions(message);
        break;
      }

      case 'revocation': {
        console.warn('⚠️ Abonnement révoqué :', msg.payload.subscription);
        break;
      }

      case 'session_keepalive': {
        console.log('📡 Keep-alive reçu');
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('🔌 Déconnecté du WebSocket Twitch');
    reconnect();
  });

  ws.on('error', (err) => {
    console.error('⚠️ Erreur WebSocket Twitch :', err.message);
    ws.close();
  });
}

function reconnect(delay = 5000) {
  if (reconnectTimeout) return;

  console.log(`🔁 Reconnexion dans ${delay / 1000}s...`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectToEventSubWS();
  }, delay);
}

async function subscribeToStreamOnline(sessionId: string) {
  const userRes = await axios.get(`https://api.twitch.tv/helix/users`, {
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: `Bearer ${USER_ACCESS_TOKEN}`,
    },
    params: {
      login: BROADCASTER_USERNAME,
    },
  });

  const userId = userRes.data.data[0].id;

  const existingSubs = await axios.get(`https://api.twitch.tv/helix/eventsub/subscriptions`, {
    headers: {
      'Client-ID': CLIENT_ID,
      Authorization: `Bearer ${USER_ACCESS_TOKEN}`,
    },
  });

  const alreadySubscribed = existingSubs.data.data.some(
    (sub: any) =>
      sub.type === 'stream.online' &&
      sub.condition.broadcaster_user_id === userId &&
      sub.transport.session_id === sessionId
  );

  if (alreadySubscribed) {
    console.log('🔁 Abonnement déjà actif pour ce streamer.');
    return;
  }

  const res = await axios.post(
    `https://api.twitch.tv/helix/eventsub/subscriptions`,
    {
      type: 'stream.online',
      version: '1',
      condition: {
        broadcaster_user_id: userId,
      },
      transport: {
        method: 'websocket',
        session_id: sessionId,
      },
    },
    {
      headers: {
        'Client-ID': CLIENT_ID,
        Authorization: `Bearer ${USER_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('✅ Abonnement stream.online effectué :', res.data.data[0].id);
}

connectToEventSubWS();