export {};

declare global {
  interface Window {
    electron?: {
      invoke(channel: string, data?: unknown): Promise<unknown>;
      onDeletePreflightProgress?(listener: (payload: unknown) => void): () => void;
    };
  }
}
