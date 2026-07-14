export class PersistenceUniqueConstraintError extends Error {
  constructor(options?: ErrorOptions) {
    super('A persistence uniqueness constraint was violated.', options);
    this.name = PersistenceUniqueConstraintError.name;
  }
}
