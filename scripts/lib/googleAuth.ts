import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_KEY_PATH = path.join(os.homedir(), '.config', 'pmp', 'gcp-service-account.json');

export function getAuthClient(scopes: string[]): JWT {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? DEFAULT_KEY_PATH;
  if (!fs.existsSync(keyPath)) {
    throw new Error(`Service account key not found at ${keyPath}`);
  }
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  return new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
  });
}

export async function getAccessToken(scopes: string[]): Promise<string> {
  const client = getAuthClient(scopes);
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain access token');
  return token;
}
