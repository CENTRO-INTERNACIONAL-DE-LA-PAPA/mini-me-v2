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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
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

type Page = "models" | "accounts";

const PAGES: { id: Page; name: string }[] = [
  { id: "models", name: "Models & keys" },
  { id: "accounts", name: "Accounts" },
];

export function SettingsView() {
  const [page, setPage] = useState<Page>("models");
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
    <main className="mx-auto grid w-full max-w-[960px] grid-cols-[160px_minmax(0,1fr)] gap-10 px-8 py-10">
      <nav aria-label="Settings sections" className="sticky top-10 self-start">
        <SidebarMenu>
          {PAGES.map((p) => (
            <SidebarMenuItem key={p.id}>
              <SidebarMenuButton isActive={page === p.id} onClick={() => setPage(p.id)}>
                <span>{p.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </nav>
      <div className="min-w-0">
        {error && <p className="mb-4 text-meta text-destructive">{error}</p>}
        {settings && page === "models" && <ModelsPage settings={settings} onChanged={refresh} />}
        {settings && page === "accounts" && (
          <AccountsPage settings={settings} onChanged={refresh} />
        )}
      </div>
    </main>
  );
}

function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-10">
      <h1 className="text-page font-bold">{title}</h1>
      <p className="mt-1.5 text-ui text-ink-2">{lead}</p>
    </header>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h3 className="text-section font-semibold">{title}</h3>
      {description && <p className="mt-1 text-meta text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One setting: its name and what it does on the left, its control on the right. */
function SettingRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-6 border-b border-border py-4">
      <div className="grid flex-1 gap-0.5">
        <Label htmlFor={htmlFor} className="font-medium">
          {label}
        </Label>
        {description && <p className="text-meta text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** A green or grey dot with its label, for whether something is set up. */
function StatusDot({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-meta text-ink-2">
      <span aria-hidden className={cn("size-[7px] rounded-full", on ? "bg-success" : "bg-off")} />
      {children}
    </span>
  );
}

function ModelsPage({ settings, onChanged }: { settings: AiSettings; onChanged: () => void }) {
  return (
    <>
      <PageHeader
        title="Models & keys"
        lead="Mini-Mes call the AI model you choose here, with your own key. Keys are kept in your system's keychain and are only sent to their provider."
      />
      <Section title="Providers">
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {PROVIDERS.map((provider) => (
            <KeyRow
              key={provider.id}
              account={provider.id}
              saved={settings.saved_keys.includes(provider.id)}
              hint={`Add an API key to use ${provider.name} models`}
              onChanged={onChanged}
            />
          ))}
        </ul>
      </Section>
      <Section title="Defaults">
        <ModelRow settings={settings} onSaved={onChanged} />
      </Section>
    </>
  );
}

function AccountsPage({ settings, onChanged }: { settings: AiSettings; onChanged: () => void }) {
  return (
    <>
      <PageHeader
        title="Accounts"
        lead="Services Mini-Me signs in to, and the one that chooses which Mini-Me answers."
      />
      <Section
        title="Ai2"
        description="Researcher and Theorist use Ai2's Asta services, which need an Ai2 account. Their messages are sent to Ai2; file contents are not."
      >
        <Ai2Row />
      </Section>
      <Section
        title="Choosing a Mini-Me"
        description="When you don't mention a Mini-Me, Typesafe's Jev chooses one. Your message's text and the names of its files are sent to Typesafe; file contents are not."
      >
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          <KeyRow
            account="typesafe"
            saved={settings.saved_keys.includes("typesafe")}
            hint="Add a key so Mini-Me can choose who answers"
            onChanged={onChanged}
          />
        </ul>
        <ThresholdRow settings={settings} onChanged={onChanged} />
      </Section>
      <Section title="Advanced">
        <DeveloperRow settings={settings} onChanged={onChanged} />
      </Section>
    </>
  );
}

function ModelRow({ settings, onSaved }: { settings: AiSettings; onSaved: () => void }) {
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
    <form onSubmit={save}>
      <SettingRow
        label="AI model"
        htmlFor="model"
        description={
          <>
            Used by every Mini-Me that calls an AI model, such as Scribe. Type the model ID
            exactly as the provider lists it.
            {status && <span className="mt-1 block text-ink-2">{status}</span>}
          </>
        }
      >
        <Select
          value={provider}
          onValueChange={(value) => {
            setProvider(value as ProviderId);
            setStatus(null);
          }}
        >
          <SelectTrigger aria-label="Provider" className="w-36">
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
        <Input
          id="model"
          className="w-56"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setStatus(null);
          }}
          placeholder="Model ID"
          spellCheck={false}
        />
        <Button type="submit" disabled={!changed}>
          Save
        </Button>
      </SettingRow>
    </form>
  );
}

function Ai2Row() {
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

  const signedIn = status?.state === "signed_in";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="grid flex-1 gap-0.5">
          <span className="font-medium">Ai2 account</span>
          <span className="text-meta text-muted-foreground">
            {signedIn
              ? `Signed in as ${status.email ?? "your Ai2 account"}`
              : status?.state === "pending"
                ? "Waiting for you to confirm the code in your browser"
                : "Sign in to use Researcher and Theorist"}
          </span>
        </span>
        <StatusDot on={signedIn}>{signedIn ? "Signed in" : "Not signed in"}</StatusDot>
        {signedIn ? (
          <Button variant="outline" onClick={() => run(api.ai2SignOut)}>
            Sign out
          </Button>
        ) : (
          status?.state !== "pending" && (
            <Button variant="outline" onClick={() => run(api.ai2StartSignIn)}>
              Sign in
            </Button>
          )
        )}
      </div>
      {status?.state === "pending" && (
        <div className="mt-3 grid gap-1 border-t border-border pt-3">
          <p>
            Confirm the code <strong className="font-mono">{status.user_code}</strong> on the
            Ai2 page that opened in your browser.
          </p>
          <p className="text-meta text-muted-foreground">
            No page? Open {status.verification_uri} and enter the code.
          </p>
        </div>
      )}
      {status?.state === "signed_out" && status.error && (
        <p className="mt-2 text-meta text-destructive">{status.error}</p>
      )}
      {error && <p className="mt-2 text-meta text-destructive">{error}</p>}
    </div>
  );
}

function ThresholdRow({ settings, onChanged }: { settings: AiSettings; onChanged: () => void }) {
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
    <form onSubmit={save}>
      <SettingRow
        label="Confidence threshold"
        htmlFor="threshold"
        description={
          <>
            From 0 to 1. When Jev is less sure than this, Mini-Me asks you to mention a Mini-Me
            with @ instead of guessing.
            {status && <span className="mt-1 block text-ink-2">{status}</span>}
          </>
        }
      >
        <Input
          id="threshold"
          type="number"
          min={0}
          max={1}
          step={0.05}
          className="w-24"
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
      </SettingRow>
    </form>
  );
}

function DeveloperRow({ settings, onChanged }: { settings: AiSettings; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingRow
      label="[DEBUG] Show Jev's answers"
      htmlFor="show-answers"
      description={
        <>
          Stores Jev's raw answers and shows them under each message.
          {error && <span className="mt-1 block text-destructive">{error}</span>}
        </>
      }
    >
      <Switch
        id="show-answers"
        checked={settings.show_answers}
        onCheckedChange={async (checked) => {
          try {
            setError(null);
            await api.setShowJevAnswers(checked);
            onChanged();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </SettingRow>
  );
}

/**
 * A provider or service in a list: a letter tile, its name, whether its key is saved, and a
 * button that opens a field to add, replace or remove the key.
 */
function KeyRow({
  account,
  saved,
  hint,
  onChanged,
}: {
  account: KeyAccount;
  saved: boolean;
  hint: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = providerName(account);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await api.saveApiKey(account, key);
      setKey("");
      setError(null);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    try {
      await api.removeApiKey(account);
      setError(null);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-semibold"
        >
          {name[0]}
        </span>
        <span className="grid flex-1 gap-0.5">
          <span className="font-medium">{name}</span>
          <span className="text-meta text-muted-foreground">
            {saved ? "Key saved in your system's keychain" : hint}
          </span>
        </span>
        <StatusDot on={saved}>{saved ? "Connected" : "Not connected"}</StatusDot>
        <Button variant="outline" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {saved ? "Edit" : "Add key"}
        </Button>
      </div>
      {editing && (
        <form className="mt-3 flex gap-2 pl-11" onSubmit={save}>
          <Input
            aria-label={`${name} key`}
            type="password"
            autoComplete="off"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={saved ? `Paste a new ${name} key to replace it` : `Paste your ${name} key`}
          />
          <Button type="submit" disabled={!key.trim()}>
            {saved ? "Replace" : "Save"}
          </Button>
          {saved && (
            <Button type="button" variant="destructive" onClick={remove}>
              Remove
            </Button>
          )}
        </form>
      )}
      {error && <p className="mt-2 pl-11 text-meta text-destructive">{error}</p>}
    </li>
  );
}
