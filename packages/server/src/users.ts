import type pg from 'pg';
import type { GoogleIdentity } from './google.js';

export interface UserStore {
  /** Returns the id of the user with this Google account, creating it on first sign-in. */
  signIn(identity: GoogleIdentity): Promise<string>;
}

export class PgUserStore implements UserStore {
  constructor(private readonly pool: pg.Pool) {}

  async signIn(identity: GoogleIdentity): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO users (google_subject, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (google_subject) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name
       RETURNING id`,
      [identity.subject, identity.email, identity.displayName],
    );
    return rows[0]!.id;
  }
}
