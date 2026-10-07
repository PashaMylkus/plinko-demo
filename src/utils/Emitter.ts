export type Listener<T> = (value: T) => void;

/** Minimal typed observer used by models to notify views. */
export class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}
