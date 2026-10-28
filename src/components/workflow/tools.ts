/** What each tool lets a Trait do, in plain words. */
const TOOL_LABELS: Record<string, string> = {
  read_file: "Read files",
  read_table: "Read tables",
  read_component: "Read tables and charts",
  save_file: "Save files",
  show_table: "Show tables",
  show_chart: "Show charts",
  show_papers: "Show papers",
  show_theories: "Show theories",
};

export const toolLabel = (tool: string) => TOOL_LABELS[tool] ?? tool;

/** A Trait node's meta line: how many tools its Trait lists. */
export const toolCount = (tools: string[]) =>
  tools.length === 0 ? "No tools" : tools.length === 1 ? "1 tool" : `${tools.length} tools`;
