// Pure logic for popup-tools: the config file, finding a tool, and the `hc run`
// line. No `herdr` import, so node:test can load it.

export const DEFAULT_SIZE = 0.9;
export const DEFAULT_TOOLS = [{ key: "g", name: "lazygit", command: "lazygit", size: DEFAULT_SIZE }];

const isText = (v) => typeof v === "string" && v.trim() !== "";

// popup-tools.json's text (null when the file is missing) -> { tools } or { error }.
export function parseConfig(text) {
  if (text == null) return { tools: DEFAULT_TOOLS };
  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    return { error: `invalid JSON: ${e.message}` };
  }
  if (!Array.isArray(config?.tools)) return { error: `"tools" must be a list` };
  if (config.tools.length === 0) return { error: `"tools" is empty` };
  const tools = [];
  for (const [i, t] of config.tools.entries()) {
    const at = `tool ${i + 1}${isText(t?.name) ? ` (${t.name})` : ""}`;
    if (t === null || typeof t !== "object" || Array.isArray(t)) return { error: `${at} must be an object` };
    if (typeof t.key !== "string" || [...t.key].length !== 1) return { error: `${at}: "key" must be one character` };
    if (!isText(t.name)) return { error: `${at}: missing "name"` };
    if (!isText(t.command)) return { error: `${at}: missing "command"` };
    if (t.size !== undefined && !(typeof t.size === "number" && t.size > 0 && t.size <= 1)) return { error: `${at}: "size" must be a number above 0, up to 1` };
    if (tools.some((o) => o.key === t.key)) return { error: `${at}: key "${t.key}" is already used` };
    tools.push({ key: t.key, name: t.name, command: t.command, size: t.size ?? DEFAULT_SIZE });
  }
  return { tools };
}

// A tool by name, else by key.
export const findTool = (tools, query) => tools.find((t) => t.name === query) ?? tools.find((t) => t.key === query);

export function hcRunArgs(tool, cwd) {
  return [
    "run", "--json", "--bg", "--rm", "--no-parent",
    ...(cwd ? ["--cwd", cwd] : []),
    "--label", "herdr.mod=popup-tools",
    "--label", `popup-tools.tool=${tool.name}`,
    // The person's login shell, so their PATH and ~ work; sh when SHELL is unset.
    "--", "/bin/sh", "-c", 'exec "${SHELL:-/bin/sh}" -lc "$1"', "sh", `exec ${tool.command}`,
  ];
}
