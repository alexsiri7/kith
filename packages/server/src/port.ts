const defaultPort = 3000;

export function resolvePort(value: string | undefined): number {
  if (value === undefined) return defaultPort;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got "${value}"`);
  }
  return port;
}
