/**
 * Database maintenance — keeps the memory store clean and bounded.
 * Runs automatically in the background, no user action needed.
 */
import type Database from 'better-sqlite3';

export interface MaintenanceResult {
  pruned: number;       // memories deleted
  vacuumed: boolean;    // SQLite VACUUM ran
  total_before: number;
  total_after: number;
}

export interface MaintenanceConfig {
  // Delete episodic memories older than this many days with importance below threshold
  episodic_ttl_days: number;         // default: 90
  episodic_prune_importance: number; // default: 0.4

  // Delete any memory type older than this many days with very low importance
  stale_ttl_days: number;            // default: 365
  stale_prune_importance: number;    // default: 0.3

  // Hard cap: if total memories exceed this, delete oldest low-importance entries
  max_memories_per_user: number;     // default: 10000

  // Run VACUUM after pruning (reclaims disk space)
  vacuum_after_prune: boolean;       // default: true
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  episodic_ttl_days: 90,
  episodic_prune_importance: 0.4,
  stale_ttl_days: 365,
  stale_prune_importance: 0.3,
  max_memories_per_user: 10000,
  vacuum_after_prune: true,
};

export class MaintenanceRunner {
  private config: MaintenanceConfig;

  constructor(private db: Database.Database, config: Partial<MaintenanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  run(user_id?: string): MaintenanceResult {
    const countStmt = user_id
      ? this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE user_id = ?')
      : this.db.prepare('SELECT COUNT(*) as c FROM memories');

    const totalBefore = user_id
      ? (countStmt.get(user_id) as { c: number }).c
      : (countStmt.get() as { c: number }).c;

    let pruned = 0;

    // 1. Prune old episodic memories with low importance
    const episodicCutoff = Date.now() - this.config.episodic_ttl_days * 86_400_000;
    if (user_id) {
      const episodicResult = this.db.prepare(`
        DELETE FROM memories
        WHERE type = 'episodic'
          AND ingestion_time < ?
          AND importance < ?
          AND user_id = ?
      `).run(episodicCutoff, this.config.episodic_prune_importance, user_id);
      pruned += episodicResult.changes;
    } else {
      const episodicResult = this.db.prepare(`
        DELETE FROM memories
        WHERE type = 'episodic'
          AND ingestion_time < ?
          AND importance < ?
      `).run(episodicCutoff, this.config.episodic_prune_importance);
      pruned += episodicResult.changes;
    }

    // 2. Prune stale any-type memories with very low importance
    const staleCutoff = Date.now() - this.config.stale_ttl_days * 86_400_000;
    if (user_id) {
      const staleResult = this.db.prepare(`
        DELETE FROM memories
        WHERE ingestion_time < ?
          AND importance < ?
          AND user_id = ?
      `).run(staleCutoff, this.config.stale_prune_importance, user_id);
      pruned += staleResult.changes;
    } else {
      const staleResult = this.db.prepare(`
        DELETE FROM memories
        WHERE ingestion_time < ?
          AND importance < ?
      `).run(staleCutoff, this.config.stale_prune_importance);
      pruned += staleResult.changes;
    }

    // 3. Cap per user — delete oldest, lowest-importance entries over the limit
    const usersToCheck: string[] = user_id
      ? [user_id]
      : (this.db.prepare('SELECT DISTINCT user_id FROM memories').all() as Array<{ user_id: string }>).map(r => r.user_id);

    for (const uid of usersToCheck) {
      const count = (this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE user_id = ?').get(uid) as { c: number }).c;
      const excess = count - this.config.max_memories_per_user;
      if (excess > 0) {
        const capResult = this.db.prepare(`
          DELETE FROM memories WHERE id IN (
            SELECT id FROM memories
            WHERE user_id = ?
            ORDER BY importance ASC, last_accessed ASC
            LIMIT ?
          )
        `).run(uid, excess);
        pruned += capResult.changes;
      }
    }

    // 4. VACUUM to reclaim disk space
    let vacuumed = false;
    if (pruned > 0 && this.config.vacuum_after_prune) {
      this.db.exec('VACUUM');
      vacuumed = true;
    }

    const totalAfter = user_id
      ? (this.db.prepare('SELECT COUNT(*) as c FROM memories WHERE user_id = ?').get(user_id) as { c: number }).c
      : (this.db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;

    return { pruned, vacuumed, total_before: totalBefore, total_after: totalAfter };
  }
}

/**
 * Schedule periodic maintenance. Returns a cleanup function to stop it.
 */
export function scheduleMaintenance(
  db: Database.Database,
  config: Partial<MaintenanceConfig> = {},
  intervalMs = 24 * 60 * 60 * 1000  // default: every 24 hours
): () => void {
  const runner = new MaintenanceRunner(db, config);

  // Run once at startup after a short delay (don't block server start)
  const startupTimer = setTimeout(() => {
    try {
      const result = runner.run();
      if (result.pruned > 0) {
        console.error(`[memord] Maintenance: pruned ${result.pruned} memories (${result.total_before} → ${result.total_after})`);
      }
    } catch (err) {
      console.error('[memord] Maintenance error:', err);
    }
  }, 30_000); // 30 seconds after start

  // Then run on interval
  const interval = setInterval(() => {
    try {
      const result = runner.run();
      if (result.pruned > 0) {
        console.error(`[memord] Maintenance: pruned ${result.pruned} memories (${result.total_before} → ${result.total_after})`);
      }
    } catch (err) {
      console.error('[memord] Maintenance error:', err);
    }
  }, intervalMs);

  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
  };
}
