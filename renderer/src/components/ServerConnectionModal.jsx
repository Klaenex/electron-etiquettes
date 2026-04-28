import { useEffect, useMemo, useState } from "react";

const DEFAULT_FORM = {
  url: "",
  apiKey: "",
};

function normalizeForm(config) {
  return {
    url: config?.url ? String(config.url) : "",
    apiKey: config?.apiKey ? String(config.apiKey) : "",
  };
}

function buildConfig(form) {
  return {
    url: form.url.trim(),
    apiKey: form.apiKey.trim(),
  };
}

function validateForm(form) {
  if (!form.url.trim()) return "Renseignez l'URL de connexion.";
  if (!form.apiKey.trim()) return "Renseignez le code d'acces.";

  try {
    const url = new URL(form.url.trim());
    if (url.protocol !== "https:") {
      return "L'URL doit commencer par https://";
    }
  } catch {
    return "URL de connexion invalide.";
  }

  return "";
}

export default function ServerConnectionModal({ open, remoteApi, onClose, onConnect }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [remember, setRemember] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(remoteApi) && !isBusy && !isLoadingSaved;
  }, [isBusy, isLoadingSaved, remoteApi]);

  useEffect(() => {
    if (!open || !remoteApi) return undefined;

    let canceled = false;
    setMessage("");
    setIsError(false);
    setIsLoadingSaved(true);

    remoteApi
      .loadSavedCredentials()
      .then((result) => {
        if (canceled) return;

        if (result?.success && result.config) {
          setForm(normalizeForm(result.config));
          setRemember(true);
          return;
        }

        if (result && !result.success) {
          setMessage(result.error || "Impossible de charger le code sauvegarde.");
          setIsError(true);
        }
      })
      .catch((err) => {
        if (canceled) return;
        setMessage(err?.message || "Impossible de charger le code sauvegarde.");
        setIsError(true);
      })
      .finally(() => {
        if (!canceled) {
          setIsLoadingSaved(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [remoteApi, open]);

  if (!open) {
    return null;
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
    setIsError(false);
  }

  async function handleTest() {
    const validationError = validateForm(form);
    if (validationError) {
      setMessage(validationError);
      setIsError(true);
      return;
    }

    setIsBusy(true);
    setMessage("Test de connexion...");
    setIsError(false);

    let result;
    try {
      result = await remoteApi.test(buildConfig(form));
    } catch (err) {
      setIsBusy(false);
      setMessage(`Connexion refusee : ${err?.message || "erreur inconnue"}`);
      setIsError(true);
      return;
    }

    setIsBusy(false);

    if (!result.success) {
      setMessage(`Connexion refusee : ${result.error || "erreur inconnue"}`);
      setIsError(true);
      return;
    }

    setMessage(`Connexion valide${result.name ? ` : ${result.name}` : ""}.`);
    setIsError(false);
  }

  async function handleConnect(event) {
    event.preventDefault();

    const validationError = validateForm(form);
    if (validationError) {
      setMessage(validationError);
      setIsError(true);
      return;
    }

    setIsBusy(true);
    setMessage("Connexion...");
    setIsError(false);

    let result;
    try {
      result = await onConnect(buildConfig(form), remember);
    } catch (err) {
      setIsBusy(false);
      setMessage(err?.message || "Connexion impossible.");
      setIsError(true);
      return;
    }

    setIsBusy(false);

    if (!result.success) {
      setMessage(result.error || "Connexion impossible.");
      setIsError(true);
      return;
    }

    onClose();
  }

  async function handleClearSaved() {
    if (!remoteApi) return;

    setIsBusy(true);
    setMessage("");
    setIsError(false);

    let result;
    try {
      result = await remoteApi.clearSavedCredentials();
    } catch (err) {
      setIsBusy(false);
      setMessage(err?.message || "Impossible d'effacer le code sauvegarde.");
      setIsError(true);
      return;
    }

    setIsBusy(false);

    if (!result.success) {
      setMessage(result.error || "Impossible d'effacer le code sauvegarde.");
      setIsError(true);
      return;
    }

    setForm(DEFAULT_FORM);
    setRemember(true);
    setMessage("Code sauvegarde efface.");
  }

  return (
    <div className="modal server-modal">
      <div className="modal-backdrop" onClick={isBusy ? undefined : onClose} />
      <form className="modal-box server-modal-box" onSubmit={handleConnect}>
        <div className="modal-header">
          <span>Connexion</span>
          <button className="modal-close" type="button" disabled={isBusy} onClick={onClose}>
            x
          </button>
        </div>

        <div className="modal-body server-modal-body">
          <div className="server-form-grid api-form-grid">
            <label className="server-form-full">
              <span>URL de connexion</span>
              <input
                type="url"
                autoComplete="url"
                placeholder="https://votre-domaine.ch/chemin/api.php"
                value={form.url}
                disabled={!canSubmit}
                onChange={(event) => updateField("url", event.target.value)}
              />
            </label>

            <label className="server-form-full">
              <span>Code d'acces</span>
              <input
                type="password"
                autoComplete="current-password"
                value={form.apiKey}
                disabled={!canSubmit}
                onChange={(event) => updateField("apiKey", event.target.value)}
              />
            </label>
          </div>

          <label className="server-remember">
            <input
              type="checkbox"
              checked={remember}
              disabled={!canSubmit}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>Memoriser ce code sur cet ordinateur</span>
          </label>

          {message && (
            <p className={`server-message ${isError ? "server-message-error" : ""}`}>
              {message}
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" disabled={!canSubmit} onClick={handleClearSaved}>
            Effacer le code
          </button>
          <span className="toolbar-flex" />
          <button type="button" disabled={!canSubmit} onClick={handleTest}>
            Tester
          </button>
          <button className="btn-primary" type="submit" disabled={!canSubmit}>
            Se connecter
          </button>
        </div>
      </form>
    </div>
  );
}
