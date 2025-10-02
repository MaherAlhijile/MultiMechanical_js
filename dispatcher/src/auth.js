// auth.js
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/auth/callback'
);

const SCOPES = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];

export function getGoogleAuthUrl() {
  return oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
}

export async function getGoogleUser(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
  const { data } = await oauth2.userinfo.get();

  return { token: tokens.access_token, name: data.name, email: data.email };
}
