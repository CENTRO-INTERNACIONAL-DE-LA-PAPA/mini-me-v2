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
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import type { Ai2Status, AiSettings, KeyAccount, ProviderId } from "../protocol/types";

const PROVIDERS: { id: ProviderId; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
];

const providerName = (id: KeyAccount) =>
  id === "typesafe" ? "Typesafe" : (PROVIDERS.find((p) => p.id === id)?.name ?? id);

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
          <RoutingSection settings={settings} onChanged={refresh} />
          <Ai2Section />
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

function Ai2Section() {
  const [status, setStatus] = useState<Ai2Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.subscribeAi2Status((next) => active && setStatus(next)).catch((e) => {
      setError(errorMessage(e));
    });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-section font-bold">Ai2 account</h2>
      <p className="mb-4 text-meta text-muted-foreground">
        Researcher and Theorist use Ai2's Asta services, which need an Ai2 account. Their
        messages are sent to Ai2; file contents are not.
      </p>
      <div className="grid gap-2 rounded-xl border border-border bg-card px-4 py-3">
        {status?.state === "signed_in" && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-[7px] rounded-full bg-success" />
            <span className="flex-1 text-ui">
              Signed in as {status.email ?? "your Ai2 account"}
            </span>
            <Button variant="ghost" onClick={() => run(api.ai2SignOut)}>
              Sign out
            </Button>
          </div>
        )}
        {status?.state === "pending" && (
          <div className="grid gap-1 text-ui">
            <p>
              Confirm the code <strong className="font-mono">{status.user_code}</strong> on the
              Ai2 page that opened in your browser.
            </p>
            <p className="text-meta text-muted-foreground">
              No page? Open {status.verification_uri} and enter the code.
            </p>
          </div>
        )}
        {(status === null || status.state === "signed_out") && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="size-[7px] rounded-full bg-off" />
            <span className="flex-1 text-ui">Not signed in</span>
            <Button variant="outline" onClick={() => run(api.ai2StartSignIn)}>
              Sign in
            </Button>
          </div>
        )}
        {status?.state === "signed_out" && status.error && (
          <p className="text-meta text-destructive">{status.error}</p>
        )}
        {error && <p className="text-meta text-destructive">{error}</p>}
      </div>
    </section>
  );
}

function RoutingSection({ settings, onChanged }: { settings: AiSettings; onChanged: () => void }) {
  const [threshold, setThreshold] = useState(String(settings.threshold));
  const [status, setStatus] = useState<string | null>(null);
  const value = Number(threshold);
  const valid = threshold.trim() !== "" && value >= 0 && value <= 1;

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await api.setRoutingThreshold(value);
      setStatus("Saved.");
      onChanged();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-section font-bold">Choosing a Mini-Me</h2>
      <p className="mb-4 text-meta text-muted-foreground">
        When you don't mention a Mini-Me, Typesafe's Jev chooses one. Your message's text and
        the names of its files are sent to Typesafe; file contents are not.
      </p>
      <ul className="mb-4 grid gap-3">
        <KeyRow
          provider="typesafe"
          saved={settings.saved_keys.includes("typesafe")}
          onChanged={onChanged}
        />
      </ul>
      <form className="grid gap-2" onSubmit={save}>
        <Label htmlFor="threshold">Confidence threshold</Label>
        <div className="flex items-center gap-3">
          <Input
            id="threshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-28"
            value={threshold}
            aria-invalid={!valid}
            onChange={(e) => {
              setThreshold(e.target.value);
              setStatus(null);
            }}
          />
          <Button type="submit" variant="outline" disabled={!valid || value === settings.threshold}>
            Save
          </Button>
          {status && <span className="text-meta text-muted-foreground">{status}</span>}
        </div>
        <p className="text-meta text-muted-foreground">
          From 0 to 1. When Jev is less sure than this, Mini-Me asks you to mention a Mini-Me
          with @ instead of guessing.
        </p>
      </form>
      <label className="mt-4 flex items-center gap-2 text-ui">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={settings.show_answers}
          onChange={async (e) => {
            try {
              await api.setShowJevAnswers(e.target.checked);
              onChanged();
            } catch (err) {
              setStatus(errorMessage(err));
            }
          }}
        />
        [DEBUG] Show Jev's answers under each message
      </label>
    </section>
  );
}

function KeyRow({
  provider,
  saved,
  onChanged,
}: {
  provider: KeyAccount;
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
    <li className="rounded-xl border border-border bg-card px-4 py-3">
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
