import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChevronLeftIcon,
  FileIcon,
  MessageSquareTextIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMiniMes } from "../../hooks/useMiniMes";
import { ComponentCard } from "../interactive/ComponentCard";
import { MiniMeAvatar } from "../minime/MiniMeAvatar";
import { MiniMeSurface } from "../minime/MiniMeSurface";
import { ConfirmButton } from "./Confirm";
import { ErrorText } from "./ErrorText";
import { Hint } from "./Hint";
import { LabelledField } from "./LabelledField";
import { ListRow } from "./ListRow";
import { SearchInput } from "./SearchInput";
import { SheetSection } from "./Sheet";
import { StatusDot } from "./StatusDot";

const BUTTON_VARIANTS = ["default", "secondary", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;

export function ComponentsDebugView({ onClose }: { onClose: () => void }) {
  return (
    <main className="mx-auto mt-[6vh] grid max-w-5xl gap-10 px-4 pb-16">
      <div>
        <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onClose}>
          <ChevronLeftIcon />
          Back
        </Button>
        <h1 className="font-serif text-sheet-title font-medium">[DEBUG] Components</h1>
      </div>
      <Buttons />
      <Selection />
      <Inputs />
      <Cards />
      <Lists />
      <StatusAndMenus />
    </main>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start justify-items-start gap-1.5">
      {children}
      <span className="text-meta text-muted-foreground">{label}</span>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-x-8 gap-y-5">{children}</div>;
}

function Buttons() {
  const [pressed, setPressed] = useState(true);
  return (
    <SheetSection title="Buttons" description="Each variant at rest, pressed (aria-pressed) and disabled.">
      <div className="grid gap-6">
        {BUTTON_VARIANTS.map((variant) => (
          <Grid key={variant}>
            <Specimen label={variant}>
              <Button variant={variant}>Add files</Button>
            </Specimen>
            <Specimen label={`${variant}, pressed`}>
              <Button variant={variant} aria-pressed>
                Add files
              </Button>
            </Specimen>
            <Specimen label={`${variant}, disabled`}>
              <Button variant={variant} disabled>
                Add files
              </Button>
            </Specimen>
          </Grid>
        ))}
        <Grid>
          {BUTTON_SIZES.map((size) => (
            <Specimen key={size} label={`size ${size}`}>
              <Button variant="secondary" size={size}>
                <PlusIcon />
                New
              </Button>
            </Specimen>
          ))}
        </Grid>
        <Grid>
          <Specimen label="Toggle, click it">
            <Button variant="secondary" aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
              <MessageSquareTextIcon />
              Comments
            </Button>
          </Specimen>
          <Specimen label="Icon, ghost">
            <Button variant="ghost" size="icon" aria-label="Delete">
              <Trash2Icon />
            </Button>
          </Specimen>
          <Specimen label="Icon, ghost, pressed">
            <Button variant="ghost" size="icon-xs" aria-label="Feature on Overview" aria-pressed>
              <PinIcon />
            </Button>
          </Specimen>
          <Specimen label="Icon, secondary">
            <Button variant="secondary" size="icon-sm" aria-label="Add">
              <PlusIcon />
            </Button>
          </Specimen>
        </Grid>
      </div>
    </SheetSection>
  );
}

function Selection() {
  const [tab, setTab] = useState("all");
  return (
    <SheetSection title="Selection" description="Tabs, toggle groups and vertical lists.">
      <Grid>
        <Specimen label="Tabs">
          <Tabs value={tab} onValueChange={(value) => setTab(value as string)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="yours">Yours</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </Specimen>
        <Specimen label="Toggle group">
          <ToggleGroup defaultValue={["files"]}>
            <ToggleGroupItem value="files">
              <FileIcon />
              Files
            </ToggleGroupItem>
            <ToggleGroupItem value="notes">Notes</ToggleGroupItem>
          </ToggleGroup>
        </Specimen>
        <Specimen label="Vertical tabs">
          <Tabs defaultValue="general" orientation="vertical" className="w-52">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
          </Tabs>
        </Specimen>
      </Grid>
    </SheetSection>
  );
}

function Inputs() {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  return (
    <SheetSection title="Inputs" description="Fields, choices and their disabled states.">
      <div className="grid gap-6">
        <Grid>
          <Specimen label="Input">
            <Input placeholder="Name" className="w-48" />
          </Specimen>
          <Specimen label="Input, disabled">
            <Input placeholder="Name" disabled className="w-48" />
          </Specimen>
          <Specimen label="Input, invalid">
            <Input defaultValue="Plot 7" aria-invalid className="w-48" />
          </Specimen>
          <Specimen label="Search">
            <SearchInput label="Search" value={search} onChange={setSearch} />
          </Specimen>
          <Specimen label="Select">
            <Select defaultValue="anthropic">
              <SelectTrigger aria-label="Provider" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </Specimen>
          <Specimen label="Select, disabled">
            <Select defaultValue="anthropic" disabled>
              <SelectTrigger aria-label="Provider, disabled" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </Specimen>
        </Grid>
        <div className="grid grid-cols-2 gap-6">
          <Textarea placeholder="Notes" />
          <LabelledField label="Project name" htmlFor="debug-name" hint="Shown in the navigation." error="A name is needed.">
            <Input id="debug-name" />
          </LabelledField>
        </div>
        <Grid>
          <Specimen label="Checkbox">
            <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="Checkbox" />
          </Specimen>
          <Specimen label="Checkbox, disabled">
            <Checkbox checked disabled aria-label="Checkbox, disabled" />
          </Specimen>
          <Specimen label="Switch">
            <Switch checked={on} onCheckedChange={setOn} aria-label="Switch" />
          </Specimen>
          <Specimen label="Switch, disabled">
            <Switch checked={false} disabled aria-label="Switch, disabled" />
          </Specimen>
          <Specimen label="Slider">
            <Slider defaultValue={40} className="w-36" aria-label="Slider" />
          </Specimen>
        </Grid>
      </div>
    </SheetSection>
  );
}

function Cards() {
  const miniMe = useMiniMes()[0];
  return (
    <SheetSection title="Cards" description="Neutral, Mini-Me and Interactive Component cards.">
      <div className="grid grid-cols-2 gap-4">
        <Card>Neutral card</Card>
        <Card size="sm">Neutral card, small</Card>
        <MiniMeSurface miniMe={miniMe} className="grid gap-3 p-5">
          <span className="flex items-center gap-2">
            <MiniMeAvatar miniMe={miniMe} size={28} />
            <span className="font-serif text-name font-medium">{miniMe?.name}</span>
          </span>
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm">
              Open chart
            </Button>
            <Button variant="secondary" size="sm" aria-pressed>
              Pressed
            </Button>
          </span>
          <Card variant="outline" size="sm">
            White card inside a Mini-Me card
          </Card>
        </MiniMeSurface>
        <MiniMeSurface className="p-5">Mini-Me card without a Mini-Me</MiniMeSurface>
        <ComponentCard
          title="Yield by plot"
          actions={
            <Button variant="ghost" size="icon-xs" aria-label="Feature on Overview">
              <PinIcon />
            </Button>
          }
          footer={<p>Sample of 50 of 1,200 rows</p>}
        >
          <div className="px-4 py-6 text-muted-foreground">Body</div>
        </ComponentCard>
      </div>
    </SheetSection>
  );
}

function Lists() {
  const miniMes = useMiniMes().slice(0, 2);
  return (
    <SheetSection title="Lists and tables">
      <div className="grid grid-cols-2 gap-6">
        <Card size="sm" className="gap-0 p-2">
          {miniMes.map((m) => (
            <ListRow
              key={m.id}
              leading={<MiniMeAvatar miniMe={m} size={22} />}
              name={m.name}
              meta="Built-in"
              trailing={<Badge variant="outline">Yours</Badge>}
              onOpen={() => {}}
            />
          ))}
        </Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plot</TableHead>
              <TableHead>Yield (t/ha)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>7</TableCell>
              <TableCell>31.2</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>8</TableCell>
              <TableCell>27.9</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </SheetSection>
  );
}

function StatusAndMenus() {
  return (
    <SheetSection title="Status, badges and menus">
      <Grid>
        <Specimen label="Badges">
          <span className="flex flex-wrap gap-1.5">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </span>
        </Specimen>
        <Specimen label="Status dots">
          <span className="flex items-center gap-3 text-meta">
            <span className="flex items-center gap-1.5">
              <StatusDot className="bg-success" />
              Connected
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot />
              Off
            </span>
          </span>
        </Specimen>
        <Specimen label="Initials">
          <Avatar size="sm">
            <AvatarFallback>LA</AvatarFallback>
          </Avatar>
        </Specimen>
        <Specimen label="Error">
          <ErrorText>Passage not found</ErrorText>
        </Specimen>
        <Specimen label="Skeleton">
          <Skeleton className="h-4 w-32" />
        </Specimen>
        <Specimen label="Hint">
          <Hint label="Feature on Overview">
            <Button variant="secondary" size="sm">
              Hover me
            </Button>
          </Hint>
        </Specimen>
        <Specimen label="Menu">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>Open menu</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Rename</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Specimen>
        <Specimen label="Confirmation">
          <ConfirmButton
            trigger={<Button variant="destructive" size="sm" />}
            question="Delete this file? This can't be undone."
            onConfirm={() => {}}
          >
            Delete
          </ConfirmButton>
        </Specimen>
      </Grid>
      <Empty className="mt-6">
        <EmptyDescription>Nothing is waiting on you.</EmptyDescription>
      </Empty>
    </SheetSection>
  );
}
