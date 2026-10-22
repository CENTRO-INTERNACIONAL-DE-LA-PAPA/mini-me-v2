import { Button } from "@/components/ui/button";
import { PinIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "../../api";

interface Featuring {
  featuredId: string | null;
  toggle: (componentId: string) => void;
}

// Provided around a Conversation; outside one (such as on the Overview) there is no button.
const FeaturingContext = createContext<Featuring | null>(null);

/** Gives the components of `projectId`'s replies a "Feature on Overview" button. */
export function FeaturingProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [featuredId, setFeaturedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getOverview(projectId)
      .then((overview) => active && setFeaturedId(overview.featured?.component.id ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [projectId]);

  const toggle = useCallback(
    (componentId: string) => {
      const next = featuredId === componentId ? null : componentId;
      api
        .featureComponent(projectId, next)
        .then(() => setFeaturedId(next))
        .catch((e) => console.error(errorMessage(e)));
    },
    [projectId, featuredId],
  );

  return (
    <FeaturingContext.Provider value={{ featuredId, toggle }}>{children}</FeaturingContext.Provider>
  );
}

/** Whether a "Feature on Overview" button can be shown for `componentId`. */
export function useCanFeature(componentId?: string): boolean {
  return useContext(FeaturingContext) !== null && componentId !== undefined;
}

/** Features the component on the Project Overview, or removes it when it is the featured one. */
export function FeatureButton({ componentId }: { componentId?: string }) {
  const featuring = useContext(FeaturingContext);
  if (!featuring || !componentId) return null;
  const featured = featuring.featuredId === componentId;
  const label = featured ? "Remove from Overview" : "Feature on Overview";
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-pressed={featured}
      aria-label={label}
      title={label}
      onClick={() => featuring.toggle(componentId)}
    >
      <PinIcon />
    </Button>
  );
}
