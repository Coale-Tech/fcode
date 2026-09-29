/**
 * omp login providers — shows authenticated state and lets the user log in
 * to each provider omp knows about (ompLoginProviders / ompLoginStart).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpLoginProvider } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";

export function OmpAccountsSection() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<OmpLoginProvider[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    api
      .ompLoginProviders()
      .then((res) => setProviders(res.providers))
      .catch(() => setProviders([]));
  };

  useEffect(() => {
    load();
  }, []);

  const handleLogin = async (id: string) => {
    setBusy(id);
    try {
      await api.ompLoginStart(id);
      load();
    } catch {
      // login browser opened; reload after user returns
    } finally {
      setBusy(null);
    }
  };

  if (!providers || providers.length === 0) return null;

  return (
    <section className="settings-card-block">
      <h2 className="settings-card-heading">{t("settings.ompAccounts")}</h2>
      <ul className="model-provider-list">
        {providers.map((p) => (
          <li key={p.id} className="model-provider-row">
            <div className="model-provider-name">
              <span>{p.name}</span>
              {p.authenticated ? (
                <Badge tone="success">{t("settings.connected")}</Badge>
              ) : null}
            </div>
            <div className="model-provider-actions">
              {p.available ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === p.id}
                  onClick={() => void handleLogin(p.id)}
                >
                  {p.authenticated
                    ? t("settings.reconnect")
                    : t("settings.connect")}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
