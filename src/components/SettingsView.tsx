import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { AiSettings, ProviderId } from "../protocol/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROVIDERS: { id: ProviderId; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
];

const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)?.name ?? id;

interface Props {
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSettings(await api.getAiSettings());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="mx-auto mt-[10vh] max-w-lg px-4 pb-16">
      <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onClose}>
        ← Back
      </Button>
      <h1 className="mb-6 text-page font-bold">Settings</h1>
      {error && <p className="mb-4 text-meta text-destructive">{error}</p>}
      {settings && (
        <>
          <ModelSection settings={settings} onSaved={refresh} />
          <section className="mt-10">
            <h2 className="mb-1 text-section font-bold">API keys</h2>
            <p className="mb-4 text-meta text-muted-foreground">
              Keys are kept in your system's keychain and are never shown again after you save
              them. Mini-Me uses the key of the provider chosen above.
            </p>
            <ul className="grid gap-3">
              {PROVIDERS.map((provider) => (
                <KeyRow
                  key={provider.id}
                  provider={provider.id}
                  saved={settings.saved_keys.includes(provider.id)}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function ModelSection({ settings, onSaved }: { settings: AiSettings; onSaved: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [status, setStatus] = useState<string | null>(null);
  const changed = provider !== settings.provider || model.trim() !== settings.model;

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await api.setAiModel(provider, model);
      setStatus("Saved.");
      onSaved();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <h2 className="text-section font-bold">AI model</h2>
      <div className="grid gap-2">
        <Label htmlFor="provider">Provider</Label>
        <Select
          value={provider}
          onValueChange={(value) => {
            setProvider(value as ProviderId);
            setStatus(null);
          }}
        >
          <SelectTrigger id="provider" className="w-full">
            <SelectValue>{(value: ProviderId) => providerName(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setStatus(null);
          }}
          placeholder={`Model ID, as listed by ${providerName(provider)}`}
          spellCheck={false}
        />
        <p className="text-meta text-muted-foreground">
          Used by every Mini-Me that calls an AI model, such as Scribe.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!changed}>
          Save
        </Button>
        {status && <span className="text-meta text-muted-foreground">{status}</span>}
      </div>
    </form>
  );
}

function KeyRow({
  provider,
  saved,
  onChanged,
}: {
  provider: ProviderId;
  saved: boolean;
  onChanged: () => void;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = providerName(provider);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await api.saveApiKey(provider, key);
      setKey("");
      setError(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    try {
      await api.removeApiKey(provider);
      setError(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className="rounded-xl border border-border px-4 py-3">
      <form className="grid gap-2" onSubmit={save}>
        <div className="flex items-center gap-2">
          <Label htmlFor={`key-${provider}`} className="flex-1">
            {name}
          </Label>
          <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <span
              aria-hidden
              className={`size-[7px] rounded-full ${saved ? "bg-success" : "bg-off"}`}
            />
            {saved ? "Saved" : "Not set"}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            id={`key-${provider}`}
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={saved ? `Paste a new ${name} key to replace it` : `Paste your ${name} key`}
          />
          <Button type="submit" variant="outline" disabled={!key.trim()}>
            {saved ? "Replace" : "Save"}
          </Button>
          {saved && (
            <Button type="button" variant="ghost" onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        {error && <p className="text-meta text-destructive">{error}</p>}
      </form>
    </li>
  );
}
