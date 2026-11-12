import { Button } from "@/components/ui/button";
import { PinIcon } from "lucide-react";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { api, errorMessage } from "../../api";
import { useLoad } from "../../hooks/useLoad";

interface Featuring {
  featuredId: string | null;
  toggle: (componentId: string) => void;
}

// Provided around a Conversation; outside one (such as on the Overview) there is no button.
const FeaturingContext = createContext<Featuring | null>(null);

/** Gives the components of `projectId`'s replies a "Feature on Overview" button. */
export function FeaturingProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { value, setValue: setFeaturedId } = useLoad(
    () => api.getOverview(projectId).then((overview) => overview.featured?.component.id ?? null),
    [projectId],
  );
  const featuredId = value ?? null;

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
