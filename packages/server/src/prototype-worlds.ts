import fp from 'fastify-plugin';
import type pg from 'pg';

export type PrototypeState = Record<string, unknown>;

export interface PrototypeWorld {
  /** Null when the player has no world yet, or started over. */
  readonly state: PrototypeState | null;
  /**
   * Increases by one on every save and when the player starts over; 0 when
   * they never saved.
   */
  readonly version: number;
}

export class PrototypeWorldConflict extends Error {
  constructor(readonly current: PrototypeWorld) {
    super(`The world is at version ${current.version}`);
    this.name = 'PrototypeWorldConflict';
  }
}

/** Each player's v2.2 prototype world, stored as the game saves it. */
export interface PrototypeWorldStore {
  load(ownerId: string): Promise<PrototypeWorld>;
  /**
   * Stores `state` as the next version, but only if the stored version is
   * still `baseVersion` (0 when the player has never saved); otherwise throws
   * `PrototypeWorldConflict` and stores nothing. Returns the new version.
   */
  save(
    ownerId: string,
    baseVersion: number,
    state: PrototypeState,
  ): Promise<number>;
  /** Forgets the world but not its version. */
  erase(ownerId: string): Promise<void>;
}

export class PgPrototypeWorldStore implements PrototypeWorldStore {
  constructor(private readonly pool: pg.Pool) {}

  async save(
    ownerId: string,
    baseVersion: number,
    state: PrototypeState,
  ): Promise<number> {
    const json = JSON.stringify(state);
    // A stored row is never at version 0, so a first save never replaces one.
    const { rows } = await this.pool.query<{ version: number }>(
      baseVersion === 0
        ? `INSERT INTO prototype_worlds (owner_id, version, state)
           VALUES ($1, 1, $2::json)
           ON CONFLICT (owner_id) DO NOTHING
           RETURNING version`
        : `UPDATE prototype_worlds
           SET version = version + 1, state = $2::json, updated_at = now()
           WHERE owner_id = $1 AND version = $3
           RETURNING version`,
      baseVersion === 0 ? [ownerId, json] : [ownerId, json, baseVersion],
    );
    if (rows[0] === undefined) {
      throw new PrototypeWorldConflict(await this.load(ownerId));
    }
    return rows[0].version;
  }

  async erase(ownerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE prototype_worlds
       SET state = NULL, version = version + 1, updated_at = now()
       WHERE owner_id = $1`,
      [ownerId],
    );
  }

  async load(ownerId: string): Promise<PrototypeWorld> {
    const { rows } = await this.pool.query<PrototypeWorld>(
      'SELECT state, version FROM prototype_worlds WHERE owner_id = $1',
      [ownerId],
    );
    return rows[0] ?? { state: null, version: 0 };
  }
}

export interface WorldSave {
  state: PrototypeState;
  version: number;
}

/** Checks the shape every prototype save has (see `newWorld` in sim.js). */
export function isWorldSave(body: unknown): body is WorldSave {
  if (typeof body !== 'object' || body === null) return false;
  const { state, version } = body as Record<string, unknown>;
  if (!Number.isSafeInteger(version) || (version as number) < 0) return false;
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return false;
  }
  const { kith, simTime } = state as Record<string, unknown>;
  return Array.isArray(kith) && Number.isFinite(simTime);
}

/** A real save is about 50 KB; this leaves room for a long-lived garden. */
export const worldBodyLimit = 2 * 1024 * 1024;

/**
 * `GET`, `PUT` and `DELETE /api/world`: the signed-in player's world. A save
 * names the version it was based on and answers 409 with the stored world when
 * another device saved since.
 */
export const worldApi = fp<{ worlds: PrototypeWorldStore }>(
  async (app, { worlds }) => {
    // auth answers 401 to /api/ requests without a session, so userId is set.
    app.get('/api/world', async (request, reply) => {
      const world = await worlds.load(request.userId!);
      if (world.state === null) {
        // The version lets the game's first save start where the last world left off.
        return reply
          .code(404)
          .send({ error: 'No world yet', version: world.version });
      }
      return world;
    });

    // A type guard rather than a JSON schema: Fastify's validator coerces
    // types, which would change the save before it is stored.
    app.put(
      '/api/world',
      { bodyLimit: worldBodyLimit },
      async (request, reply) => {
        if (!isWorldSave(request.body)) {
          return reply
            .code(400)
            .send({ error: 'Expected { state, version } with a Kith world' });
        }
        const { state, version } = request.body;
        try {
          return {
            version: await worlds.save(request.userId!, version, state),
          };
        } catch (error) {
          if (!(error instanceof PrototypeWorldConflict)) throw error;
          return reply.code(409).send(error.current);
        }
      },
    );

    app.delete('/api/world', async (request, reply) => {
      await worlds.erase(request.userId!);
      return reply.code(204).send();
    });
  },
);
