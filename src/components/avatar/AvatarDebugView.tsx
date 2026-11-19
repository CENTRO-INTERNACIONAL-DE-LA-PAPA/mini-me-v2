import { Button } from "@/components/ui/button";
import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";
import type { MiniMeAvatar } from "../../protocol/types";
import { Avatar } from "./Avatar";
import { ColorPicker } from "./ColorPicker";
import { COLOR_FAMILIES, type HueColor } from "./palette";
import { LAYERS } from "./parts";
import { PartTabs } from "./PartGrid";

interface Props {
  onClose: () => void;
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];


/** A development-only page for trying combinations of avatar parts and colours. */
export function AvatarDebugView({ onClose }: Props) {
  const [avatar, setAvatar] = useState<MiniMeAvatar>({
    base: "classic",
    eyes: "normal",
    mouth: "smile",
  });
  const [color, setColor] = useState<HueColor | null>(null);
  const shown = { avatar, color };

  // Optional layers are left empty a quarter of the time.
  const randomize = () => {
    setAvatar(
      Object.fromEntries(
        LAYERS.filter((l) => l.parts.length > 0 && (l.required || Math.random() >= 0.25)).map(
          (l) => [l.name, pick(l.parts).id],
        ),
      ),
    );
    setColor(pick(COLOR_FAMILIES));
  };

  return (
    <main className="mx-auto mt-[6vh] max-w-5xl px-4 pb-16">
      <Button variant="link" className="mb-2 px-0 text-muted-foreground" onClick={onClose}>
        <ChevronLeftIcon />
        Back
      </Button>
      <h1 className="mb-6 text-page font-bold">[DEBUG] Avatars</h1>
      <div className="grid grid-cols-[300px_1fr] items-start gap-10">
        <aside className="sticky top-6 grid gap-6">
          <div className="grid place-items-center rounded-xl border border-border bg-card p-6">
            <Avatar {...shown} size={220} />
          </div>
          <div className="flex items-end justify-center gap-5">
            <Avatar {...shown} size={64} />
            <Avatar {...shown} size={32} />
            <Avatar {...shown} size={20} />
          </div>
          <ColorPicker value={color} onChange={setColor} />
          <code className="text-meta break-all text-muted-foreground">
            {`<Avatar avatar={${JSON.stringify(avatar)}}` +
              (color ? ` color={{ solid: "${color.solid}", ink: "${color.ink}" }}` : "") +
              " />"}
          </code>
          <Button variant="outline" onClick={randomize}>
            Randomize
          </Button>
        </aside>
        <PartTabs avatar={avatar} color={color} onChange={setAvatar} />
      </div>
    </main>
  );
}
