export type ClaudeLoginMethod = 'subscription' | 'console' | 'sso';
export type ClaudeConnection = {
  signedIn: boolean;
  billing: 'subscription' | 'api' | 'external' | 'unknown';
};
export type ClaudeLoginState = {
  authUrl?: string;
  pending: boolean;
  method: ClaudeLoginMethod;
};
