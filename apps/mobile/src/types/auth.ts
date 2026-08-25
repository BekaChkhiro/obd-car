export interface UserPublic {
  id: number;
  phone: string;
  /** Null when the account has no name on file — not an empty string. */
  first_name: string | null;
  last_name: string | null;
  locale: string;
  created_at: string;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
  locale?: string;
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

export interface RequestCodePayload {
  /** E.164, e.g. "+995555123456". */
  phone: string;
  /**
   * Present on the register screen, absent on sign-in.
   *
   * The server caches these against the code it sends, so a phone with no
   * account yet can be created the moment the code comes back verified —
   * registering and signing in end up being the same request.
   */
  first_name?: string | null;
  last_name?: string | null;
}

export interface RequestCodeResponse {
  expires_in: number;
  resend_after: number;
}

export interface VerifyCodePayload {
  phone: string;
  code: string;
}
