/** Connect's tabs (Figma "seven connectors · one server", 492:5430 etc -- Slack removed since). */
export const CONNECT_TABS = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'claude-ai', label: 'claude.ai' },
  { id: 'brightdata', label: 'Bright Data' },
  { id: 'discord', label: 'Discord' },
  { id: 'email', label: 'Email' },
  { id: 'model', label: 'Model' },
  { id: 'api', label: 'API' },
] as const;

export type ConnectTabId = (typeof CONNECT_TABS)[number]['id'];

export const isConnectTabId = (s: string | undefined): s is ConnectTabId =>
  CONNECT_TABS.some((t) => t.id === s);
