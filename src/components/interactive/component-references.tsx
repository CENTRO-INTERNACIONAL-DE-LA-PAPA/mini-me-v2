import { Button } from "@/components/ui/button";
import { MessageSquarePlusIcon } from "lucide-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { componentTarget, type ReferenceTarget } from "../../protocol/references";
import type { ComponentName } from "./component-names";

interface ComponentReferences {
  /** Each `table` and `chart` component of the open Conversation, by component ID. */
  names: Map<string, ComponentName>;
  /** Adds a reference to the end of the composer's text. */
  append: (target: ReferenceTarget) => void;
}

// Provided around a Conversation; outside one (such as on the Overview) there is no button.
const ComponentReferencesContext = createContext<ComponentReferences | null>(null);

/** Lets the tables and charts of a Conversation's replies add `$` references to its
 * composer. */
export function ComponentReferencesProvider({
  names,
  append,
  children,
}: ComponentReferences & { children: ReactNode }) {
  const value = useMemo(() => ({ names, append }), [names, append]);
  return (
    <ComponentReferencesContext.Provider value={value}>
      {children}
    </ComponentReferencesContext.Provider>
  );
}

/** The name and kind of a table or chart of the open Conversation, if there is one. */
export function useComponentName(componentId?: string): ComponentName | undefined {
  const references = useContext(ComponentReferencesContext);
  return componentId === undefined ? undefined : references?.names.get(componentId);
}

/** Adds a `$` reference to the component at the end of the composer's text. */
export function ReferenceButton({ componentId }: { componentId?: string }) {
  const references = useContext(ComponentReferencesContext);
  const component = useComponentName(componentId);
  if (!references || !component) return null;
  const label = `Add $${component.name} to the message`;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={() => references.append(componentTarget(component.name, component.id))}
    >
      <MessageSquarePlusIcon />
    </Button>
  );
}
