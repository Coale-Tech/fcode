/** Raven chat destination (Settings → Raven), persisted in `<dataDir>/raven-settings.json`. */
export type RavenSettings = {
  enabled: boolean;
  /** Frappe site origin that has Raven installed; the pane opens `<url>/raven`. */
  url: string;
};
