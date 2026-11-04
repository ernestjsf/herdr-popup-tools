// Config parsing, tool lookup and the hc run line. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, findTool, hcRunArgs } from "../mods/popup-tools/tools.js";

const config = (tools) => JSON.stringify({ tools });

test("a missing file gives the built-in lazygit", () => {
  assert.deepEqual(parseConfig(null), { tools: [{ key: "g", name: "lazygit", command: "lazygit", size: 0.9 }] });
});

test("a valid file keeps order, sizes default to 0.9", () => {
  const { tools } = parseConfig(config([
    { key: "g", name: "lazygit", command: "lazygit" },
    { key: "h", name: "hunk", command: "sh ~/.config/herdr/hunk-open.sh", size: 0.75 },
  ]));
  assert.deepEqual(tools, [
    { key: "g", name: "lazygit", command: "lazygit", size: 0.9 },
    { key: "h", name: "hunk", command: "sh ~/.config/herdr/hunk-open.sh", size: 0.75 },
  ]);
});

test("bad JSON names the parse problem", () => {
  assert.match(parseConfig("{ tools: [").error, /^invalid JSON: /);
});

test("tools must be a non-empty list", () => {
  assert.equal(parseConfig("{}").error, `"tools" must be a list`);
  assert.equal(parseConfig(`{"tools": {}}`).error, `"tools" must be a list`);
  assert.equal(parseConfig("null").error, `"tools" must be a list`);
  assert.equal(parseConfig(config([])).error, `"tools" is empty`);
});

test("a duplicate key names the tool and key", () => {
  const r = parseConfig(config([
    { key: "g", name: "lazygit", command: "lazygit" },
    { key: "g", name: "gitui", command: "gitui" },
  ]));
  assert.equal(r.error, `tool 2 (gitui): key "g" is already used`);
});

test("a missing command names the tool", () => {
  assert.equal(parseConfig(config([{ key: "x", name: "x" }])).error, `tool 1 (x): missing "command"`);
  assert.equal(parseConfig(config([{ key: "x", name: "x", command: "  " }])).error, `tool 1 (x): missing "command"`);
});

test("key, name, size and entry shape are checked", () => {
  assert.equal(parseConfig(config([{ key: "gg", name: "a", command: "a" }])).error, `tool 1 (a): "key" must be one character`);
  assert.equal(parseConfig(config([{ name: "a", command: "a" }])).error, `tool 1 (a): "key" must be one character`);
  assert.equal(parseConfig(config([{ key: "a", command: "a" }])).error, `tool 1: missing "name"`);
  assert.equal(parseConfig(config([{ key: "a", name: "a", command: "a", size: 1.5 }])).error, `tool 1 (a): "size" must be a number above 0, up to 1`);
  assert.equal(parseConfig(config([{ key: "a", name: "a", command: "a", size: "0.5" }])).error, `tool 1 (a): "size" must be a number above 0, up to 1`);
  assert.equal(parseConfig(config(["lazygit"])).error, "tool 1 must be an object");
  assert.equal(parseConfig(config([{ key: "é", name: "e", command: "e" }])).tools[0].key, "é");
});

test("findTool matches a name first, then a key", () => {
  const tools = [
    { key: "g", name: "lazygit", command: "lazygit", size: 0.9 },
    { key: "h", name: "g", command: "hunk", size: 0.9 },
  ];
  assert.equal(findTool(tools, "lazygit").command, "lazygit");
  assert.equal(findTool(tools, "h").command, "hunk");
  assert.equal(findTool(tools, "g").command, "hunk");
  assert.equal(findTool(tools, "nope"), undefined);
  assert.equal(findTool(tools, undefined), undefined);
});

test("hcRunArgs: labels, folder and a login shell", () => {
  const tool = { key: "h", name: "hunk", command: "sh ~/x.sh", size: 0.9 };
  assert.deepEqual(hcRunArgs(tool, "/repo"), [
    "run", "--json", "--bg", "--rm", "--no-parent", "--cwd", "/repo",
    "--label", "herdr.mod=popup-tools", "--label", "popup-tools.tool=hunk",
    "--", "/bin/sh", "-c", 'exec "${SHELL:-/bin/sh}" -lc "$1"', "sh", "exec sh ~/x.sh",
  ]);
  assert.ok(!hcRunArgs(tool, null).includes("--cwd"));
});
