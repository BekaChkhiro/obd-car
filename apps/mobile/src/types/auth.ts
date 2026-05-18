export interface UserPublic {
  id: number;
  email: string;
  locale: string;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthResponse {
  user: UserPublic;
  tokens: TokenPair;
}

export interface RegisterPayload {
  email: string;
  password: string;
  locale?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
