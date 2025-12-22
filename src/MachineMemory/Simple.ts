import { logToSpan } from 'arvo-core';
import { SimpleEventBroker } from '../utils/SimpleEventBroker';
import type { IMachineMemory, MachineMemoryMetadata } from './interface';

/**
 * In-memory implementation of machine state storage for single-instance NodeJS applications.
 *
 * @example
 * const memory = new SimpleMachineMemory();
 * const orchestrator = createArvoOrchestrator({
 *   memory,
 *   machines: [workflow]
 * });
 *
 * @warning Concurrency Limitations
 *
 * This implementation is NOT concurrency-safe. Lock acquisition is not atomic,
 * making it unsuitable for parallel event processing where multiple handlers
 * might process events for the same workflow simultaneously.
 *
 * **Safe Usage:**
 * - {@link SimpleEventBroker} (sequential event processing)
 * - Isolated handlers without shared durable state requirements
 *
 * **Unsafe Usage:**
 * - In-memory parallel/concurrent event brokers (e.g., p-queue with prefetch > 1)
 *
 * For concurrent in-process event processing, use the concurrency-safe memory
 * backend from the `@arvo-tools/concurrent` package, which provides atomic lock
 * operations suitable for parallel execution within a single process.
 *
 * **Unsuitable For:**
 * - Multi-instance deployments
 * - Distributed systems requiring shared state across processes
 *
 * For these scenarios, implement or use a database-backed memory backend
 * (Redis, PostgreSQL, DynamoDB, etc.) that provides distributed state
 * persistence and atomic locking across instances. You can also explore the
 * Arvo tool eco-system `@arvo-tools`
 */
export class SimpleMachineMemory<T extends Record<string, any> = Record<string, any>> implements IMachineMemory<T> {
  private readonly memoryMap: Map<string, T> = new Map();
  private readonly lockMap: Map<string, boolean> = new Map();
  private readonly enableCleanup: boolean = true;

  constructor(config?: { enableCleanup?: boolean }) {
    this.enableCleanup = config?.enableCleanup ?? true;
  }

  /**
   * Gets stored state for a machine instance
   * @param id Machine instance ID
   * @returns State data or null if not found
   * @throws {Error} When id is empty or undefined
   */
  async read(id: string): Promise<T | null> {
    if (!id) {
      throw new Error('Machine ID is required for read operation');
    }
    return this.memoryMap.get(id) ?? null;
  }

  /**
   * Stores state for a machine instance
   * @param id Machine instance ID
   * @param data State to store
   * @throws {Error} When id is empty/undefined or data is null/undefined
   */
  async write(id: string, data: T): Promise<void> {
    if (!id) {
      throw new Error('Machine ID is required for write operation');
    }
    if (!data) {
      throw new Error('Data is required for write operation');
    }
    this.memoryMap.set(id, { ...data });
  }

  /**
   * Attempts to acquire lock for machine instance
   * @param id Machine instance ID
   * @returns Success status of lock acquisition
   * @throws {Error} When id is empty or undefined
   */
  async lock(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('Machine ID is required for lock operation');
    }
    if (this.lockMap.get(id)) {
      return false;
    }
    this.lockMap.set(id, true);
    return true;
  }

  /**
   * Releases lock for machine instance
   * @param id Machine instance ID
   * @returns True when lock is released
   * @throws {Error} When id is empty or undefined
   */
  async unlock(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('Machine ID is required for unlock operation');
    }
    this.lockMap.delete(id);
    return !this.lockMap.get(id);
  }

  async cleanup(id: string): Promise<void> {
    if (!this.enableCleanup) {
      logToSpan({
        level: 'INFO',
        message: 'Skipping cleanup due to config setting',
      });
      return;
    }
    this.memoryMap.delete(id);
    this.lockMap.delete(id);
  }

  // Clears all stored data and locks
  clear() {
    this.lockMap.clear();
    this.memoryMap.clear();
  }
}
