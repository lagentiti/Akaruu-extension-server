import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const USER_ACCESS_TOKEN = process.env.TWITCH_OAUTH_TOKEN;

if (!USER_ACCESS_TOKEN) {
  console.error('❌ TWITCH_USER_ACCESS_TOKEN est manquant dans le fichier .env');
  process.exit(1);
}

(async () => {
  try {
    const validation = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: {
        Authorization: `Bearer ${USER_ACCESS_TOKEN}`,
      },
    });
    console.log('✅ Token valide pour :', validation.data.login);
  } catch (err: any) {
    console.error('❌ Erreur de validation du token :', err.response?.data || err.message);
  }
})();
