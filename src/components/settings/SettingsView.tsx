import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FlaskConicalIcon,
  InfoIcon,
  KeyRoundIcon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  WrenchIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { api, errorMessage } from "../../api";
import ai2Logo from "../../assets/logos/ai2-logo.png";
import cipLogo from "../../assets/logos/cip-logo.png";
import type {
  Ai2Status,
  AiSettings,
  KeyAccount,
  ProviderId,
  QuartoStatus,
} from "../../protocol/types";
import { openLink } from "../interactive/links";
import { SectionPage, type Section } from "../shell/SectionPage";
import type { SettingsPageId } from "../shell/view";
import { refreshDeveloperMode, useDeveloperMode } from "../../hooks/useDeveloperMode";
import { recheckQuarto, showQuarto, useQuarto } from "../../hooks/useQuarto";
import { refreshUserProfile, useUserProfile } from "../../hooks/useUserProfile";

const PROVIDERS: { id: ProviderId; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "openrouter", name: "OpenRouter" },
];

const providerName = (id: KeyAccount) =>
  id === "typesafe" ? "Typesafe" : (PROVIDERS.find((p) => p.id === id)?.name ?? id);

const REPOSITORY_URL = "https://github.com/CENTRO-INTERNACIONAL-DE-LA-PAPA/mini-me-v2";

type Page = SettingsPageId;

const PAGES: Section<Page>[] = [
  { id: "general", name: "General", icon: SlidersHorizontalIcon },
  { id: "models", name: "Models & keys", icon: KeyRoundIcon },
  { id: "accounts", name: "Accounts", icon: UserRoundIcon },
  { id: "developer", name: "Developer", icon: WrenchIcon },
  { id: "about", name: "About", icon: InfoIcon },
];

/** `onOpenAvatars` opens the avatar parts page, a developer option, and `onOpenWhatsNew` the
 * page of the version's changes. Settings opens at `initialPage`, General unless given. */
export function SettingsView({
  onOpenAvatars,
  onOpenWhatsNew,
  initialPage = "general",
}: {
  onOpenAvatars: () => void;
  onOpenWhatsNew: () => void;
  initialPage?: Page;
}) {
  const [page, setPage] = useState<Page>(initialPage);
  const developer = useDeveloperMode();
  // The Developer page is listed only while Developer mode is on.
  const pages = developer ? PAGES : PAGES.filter((section) => section.id !== "developer");
  const shown = pages.some((section) => section.id === page) ? page : "general";
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
    <SectionPage
      title="Settings"
      sections={pages}
      active={shown}
      onSelect={setPage}
    >
      <div className="min-w-0">
        {error && <p className="mb-4 text-meta text-destructive">{error}</p>}
        {shown === "general" && <GeneralPage />}
        {settings && shown === "models" && <ModelsPage settings={settings} onChanged={refresh} />}
        {settings && shown === "accounts" && (
          <AccountsPage settings={settings} onChanged={refresh} />
        )}
        {settings && shown === "developer" && (
          <DeveloperPage settings={settings} onChanged={refresh} onOpenAvatars={onOpenAvatars} />
        )}
        {shown === "about" && <AboutPage onOpenWhatsNew={onOpenWhatsNew} />}
      </div>
    </SectionPage>
  );
}

function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-7 grid gap-1.5">
      <h1 className="font-serif text-sheet-title font-medium text-foreground">{title}</h1>
      <p className="text-ui text-pretty text-muted-foreground">{lead}</p>
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
    <section className="mt-7 first:mt-0">
      <h3 className="font-serif text-heading text-foreground">{title}</h3>
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

/** An account or key in Settings: a white outlined card, so the well-filled buttons and
 * inputs inside it stand out. */
function AccountCard({ render, children }: { render?: ReactElement; children: ReactNode }) {
  return (
    <Card render={render} className="gap-0 rounded-2xl border border-border bg-card px-4 py-3.5">
      {children}
    </Card>
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

function GeneralPage() {
  return (
    <>
      <PageHeader title="General" lead="About you, and how Home looks." />
      <Section
        title="You"
        description="What Mini-Me knows about you. It stays on this computer and is not sent to AI models."
      >
        <NameRow />
      </Section>
      <Section title="Home">
        <HomeMiniMesRow />
      </Section>
      <Section
        title="Documents"
        description="Documents are edited and rendered with the Quarto installed on this computer."
      >
        <QuartoRow />
      </Section>
    </>
  );
}

/** The options for developing and testing Mini-Me. Listed only while Developer mode is on. */
function DeveloperPage({
  settings,
  onChanged,
  onOpenAvatars,
}: {
  settings: AiSettings;
  onChanged: () => void;
  onOpenAvatars: () => void;
}) {
  return (
    <>
      <PageHeader
        title="Developer"
        lead="Options for developing and testing Mini-Me. This page is listed while Developer mode (Settings → About) is on."
      />
      <ThresholdRow settings={settings} onChanged={onChanged} />
      <DeveloperRow settings={settings} onChanged={onChanged} />
      <SettingRow
        label="[DEBUG] Avatars"
        description="Every avatar base, face, accessory and colour, to try combinations."
      >
        <Button variant="outline" onClick={onOpenAvatars}>
          Open
        </Button>
      </SettingRow>
    </>
  );
}

/** What Settings says about the user's Quarto. */
function quartoSummary(status: QuartoStatus): string {
  switch (status.state) {
    case "found":
      return `Quarto ${status.version} is installed at ${status.path}.`;
    case "too_old":
      return `Quarto ${status.version} at ${status.path} is too old; version ${status.minimum} or later is needed.`;
    case "broken":
      return `Quarto could not be run at ${status.path}.`;
    case "missing":
      return "Quarto was not found. Install it from quarto.org to edit documents, or set where it is.";
  }
}

function QuartoRow() {
  const status = useQuarto();
  if (!status) return null;
  // Keyed by the chosen location so the field starts from it again after each change.
  return <QuartoForm key={status.chosen ? (status.path ?? "") : ""} status={status} />;
}

function QuartoForm({ status }: { status: QuartoStatus }) {
  const chosen = status.chosen ? (status.path ?? "") : "";
  const [path, setPath] = useState(chosen);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string | null) {
    try {
      showQuarto(await api.setQuartoPath(next));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void change(path);
      }}
    >
      <SettingRow
        label="Quarto"
        htmlFor="quarto-path"
        description={
          <>
            {quartoSummary(status)}
            {error && <span className="mt-1 block text-destructive">{error}</span>}
          </>
        }
      >
        <Input
          id="quarto-path"
          className="w-56"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setError(null);
          }}
          placeholder="Where Quarto is"
        />
        <Button type="submit" disabled={path.trim() === chosen}>
          Save
        </Button>
        {status.chosen && (
          <Button type="button" variant="outline" onClick={() => void change(null)}>
            Clear
          </Button>
        )}
        <Button type="button" variant="outline" onClick={recheckQuarto}>
          Check
        </Button>
      </SettingRow>
    </form>
  );
}

function NameRow() {
  const profile = useUserProfile();
  if (!profile) return null;
  // Keyed by the saved name so the field starts from it again after each save.
  return (
    <NameForm
      key={profile.name ?? ""}
      saved={profile.name ?? ""}
      unreadable={profile.unreadable}
    />
  );
}

function NameForm({ saved, unreadable }: { saved: string; unreadable: string | null }) {
  const [name, setName] = useState(saved);
  const [status, setStatus] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      refreshUserProfile(await api.saveUserName(name));
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  return (
    <form onSubmit={save}>
      <SettingRow
        label="Your name"
        htmlFor="user-name"
        description={
          <>
            Shown in Home's greeting and on your files. Leave it empty to show no name.
            {unreadable && (
              <span className="mt-1 block text-destructive">
                user-profile.json in the app's config folder could not be read ({unreadable}), so it is
                left unchanged. Fix or remove it, then restart Mini-Me.
              </span>
            )}
            {status && <span className="mt-1 block text-destructive">{status}</span>}
          </>
        }
      >
        <Input
          id="user-name"
          className="w-56"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setStatus(null);
          }}
          placeholder="Your name"
          disabled={unreadable !== null}
        />
        <Button type="submit" disabled={unreadable !== null || name.trim() === saved}>
          Save
        </Button>
      </SettingRow>
    </form>
  );
}

function AboutPage({ onOpenWhatsNew }: { onOpenWhatsNew: () => void }) {
  return (
    <>
      <PageHeader title="About" lead="What Mini-Me is, who makes it, and which version is running." />
      <div className="grid gap-3 text-body text-foreground">
        <p>
          Mini-Me is a local-first research tool for scientists at the International Potato
          Center. Instead of asking you to adopt a new way of working, it lets you build
          Mini-Mes: small versions of yourself that carry out research the way you already
          would, from ideas and hypothesis validation to experiments and results.
        </p>
      </div>
      <div className="mt-6">
        <AboutRow onOpenWhatsNew={onOpenWhatsNew} />
        <DeveloperModeRow />
        <SettingRow label="GitHub Repository">
          <span className="text-ui text-muted-foreground tabular-nums">
            {/* The webview opens no new windows; the link opens in the system's browser. */}
            <a
              href={REPOSITORY_URL}
              onClick={(event) => {
                event.preventDefault();
                openLink(REPOSITORY_URL);
              }}
            >
              CENTRO-INTERNACIONAL-DE-LA-PAPA/mini-me-v2
            </a>
          </span>
        </SettingRow>
      </div>
      <Collaboration />
    </>
  );
}

function DeveloperModeRow() {
  const developer = useDeveloperMode();
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingRow
      label="Developer mode"
      htmlFor="developer-mode"
      description={
        <>
          Shows the [DEBUG] options under General, and the right-click menu with Inspect.
          Inspect follows this switch from the next time Mini-Me starts.
          {error && <span className="mt-1 block text-destructive">{error}</span>}
        </>
      }
    >
      <Switch
        id="developer-mode"
        checked={developer}
        onCheckedChange={async (checked) => {
          try {
            setError(null);
            await api.setDeveloperMode(checked);
            refreshDeveloperMode(checked);
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </SettingRow>
  );
}

/** The two institutions that make Mini-Me, as a lockup: both logos, one height, an × between. */
function Collaboration() {
  return (
    <figure className="flex flex-col items-center gap-4 py-8">
      <div className="flex items-center gap-6">
        <img src={cipLogo} alt="International Potato Center (CIP) and CGIAR" className="h-10 w-auto" />
        <span aria-hidden className="text-heading text-muted-foreground">
          ×
        </span>
        <img src={ai2Logo} alt="Ai2" className="h-10 w-auto" />
      </div>
      <figcaption className="text-meta text-muted-foreground">
        A collaboration between the International Potato Center (CIP) and The Allen Institute for Artificial Intelligence (Ai2).
      </figcaption>
    </figure>
  );
}

/** Which app and version is running, such as "Mini-Me Dev 0.4.0". */
function AboutRow({ onOpenWhatsNew }: { onOpenWhatsNew: () => void }) {
  const [about, setAbout] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getName(), getVersion()])
      .then(([name, version]) => active && setAbout(`${name} ${version}`))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingRow label="Version">
      <span className="text-ui text-muted-foreground tabular-nums">{about ?? "…"}</span>
      <Button variant="secondary" onClick={onOpenWhatsNew}>
        What's new
      </Button>
    </SettingRow>
  );
}

function HomeMiniMesRow() {
  const [show, setShow] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getHomeSettings()
      .then((home) => active && setShow(home.show_mini_mes))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingRow
      label="Show Mini-Mes on Home"
      htmlFor="home-mini-mes"
      description={
        <>
          Every Mini-Me drops onto Home when it opens, and you can grab and throw them.
          {error && <span className="mt-1 block text-destructive">{error}</span>}
        </>
      }
    >
      <Switch
        id="home-mini-mes"
        checked={show ?? false}
        disabled={show === null}
        onCheckedChange={async (checked) => {
          try {
            setError(null);
            await api.setShowHomeMiniMes(checked);
            setShow(checked);
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </SettingRow>
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
        <ul className="grid gap-2">
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
        description="When you don't mention a Mini-Me, Typesafe's Jev chooses one. Your message's text, the names of the Conversation's files, and the start of the last few messages and who wrote them are sent to Typesafe; file contents are not."
      >
        <ul className="grid gap-2">
          <KeyRow
            account="typesafe"
            saved={settings.saved_keys.includes("typesafe")}
            hint="Add a key so Mini-Me can choose who answers"
            onChanged={onChanged}
          />
        </ul>
      </Section>
    </>
  );
}

function ModelRow({ settings, onSaved }: { settings: AiSettings; onSaved: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  /** How testing the model went, shown in a popover over its button; null while closed. */
  const [tested, setTested] = useState<string | null>(null);
  const changed = provider !== settings.provider || model.trim() !== settings.model;

  /** Tests the model in the fields, saved or not, and says how it went. */
  async function testModel() {
    setTesting(true);
    setTested("Testing the model…");
    try {
      await api.testModel(provider, model);
      setTested("This model works with Mini-Me.");
    } catch (e) {
      setTested(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

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
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={!changed}>
            Save
          </Button>
          {/* Says how the test went; clicking outside closes it. */}
          <Popover open={tested !== null} onOpenChange={(open) => !open && setTested(null)}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Test model"
                  title="Test model"
                  disabled={testing || !model.trim()}
                />
              }
              onClick={testModel}
            >
              <FlaskConicalIcon />
            </PopoverTrigger>
            <PopoverContent align="end">
              <p>{tested}</p>
            </PopoverContent>
          </Popover>
        </div>
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
    <AccountCard>
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
    </AccountCard>
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
        label="[DEBUG] Jev's confidence threshold"
        htmlFor="threshold"
        description={
          <>
            From 0 to 1. When Jev is less sure than this of its choice, Assistant answers
            instead, and Jev adds no reaction.
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
    <AccountCard render={<li />}>
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted font-serif text-name font-medium"
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
        <form className="mt-3 flex gap-2 pl-[50px]" onSubmit={save}>
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
    </AccountCard>
  );
}
