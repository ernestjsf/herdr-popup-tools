// popup-tools: one key opens a picker of tools; the picked one runs in a 90%
// dialog in the focused pane's folder. The dialog closes when the program
// exits; closing the dialog (the key again, Esc, a click outside) ends it.
// Three roles in one mod: the picker (mod.open), and the 0px sentinel block in
// each tool dialog that cleans up after it.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { hc, focused, terminals, run, openOverlay, closeOverlay, notify, props, theme, appHome, readTextFile, shared, setShared } from "herdr";
import { parseConfig, findTool, hcRunArgs } from "./tools.js";

const NAME = "popup-tools";
const REQUEST = "popup-tools.request";

// Survives hot reload: the open tool dialog's id, and the once-per-overlay guard.
const memory = () => (globalThis.__popup_tools_v1 ??= {});
const alive = (address) => terminals().some((t) => t.address === address);
const fail = (error) => notify({ title: NAME, body: String(error?.message ?? error), level: "error" });

async function loadTools() {
  const r = parseConfig(await readTextFile(`${appHome()}/popup-tools.json`));
  if (r.error) throw new Error(`popup-tools.json: ${r.error}`);
  return r.tools;
}

// Starts the tool, closes the picker, opens the dialog. Closing the picker
// first keeps the keyboard with the new dialog; this task runs to its end
// because nothing awaits after the close.
async function launch(tool, picker, now = focused()) {
  const r = await hc(hcRunArgs(tool, now?.cwd));
  if (r.code !== 0) throw new Error(r.stderr.trim() || `hc run exited ${r.code}`);
  const terminal = JSON.parse(r.stdout).address;
  delete memory().handled; // the picker's task may not reach its finally
  closeOverlay(picker);
  memory().dialog = openOverlay({
    kind: "dialog", width: tool.size, height: tool.size,
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: 0 }, content: { mod: NAME, props: { role: "sentinel", terminal, previousPane: now?.pane } } },
        { type: "block", content: { terminal } },
      ],
    },
  });
}

export default class PopupTools extends View {
  init(_props, cx) {
    this.copy = props() ?? {};
    if (this.copy.role === "sentinel") return;
    this.origin = focused(); // the pane under the picker, before it takes the keyboard
    this.tools = null;
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(600, () => this.handle.focus());

    const owner = this.copy.overlay;
    const mem = memory();
    const request = shared(REQUEST);
    if (!mem.dialog && !request) {
      cx.spawn(async (cx) => {
        try {
          this.tools = await loadTools();
          cx.notify();
        } catch (error) {
          fail(error);
          closeOverlay(owner);
        }
      });
      return;
    }
    // Toggle off, or a request from another mod: no picker. init can run
    // twice for one overlay; act once, and clear the guard after (ids are reused).
    this.hidden = this.busy = true;
    if (mem.handled === owner) return;
    mem.handled = owner;
    cx.spawn(async () => {
      try {
        if (mem.dialog) {
          closeOverlay(mem.dialog);
          return;
        }
        setShared(REQUEST, null);
        const tool = findTool(await loadTools(), request?.tool);
        if (!tool) throw new Error(`no tool "${request?.tool}" in popup-tools.json`);
        await launch(tool, owner);
      } catch (error) {
        fail(error);
      } finally {
        delete mem.handled;
        closeOverlay(owner);
      }
    });
  }

  choose(tool, cx) {
    if (!tool || this.busy) return;
    this.busy = true;
    const owner = this.copy.overlay;
    cx.spawn(async () => {
      try {
        await launch(tool, owner, this.origin);
      } catch (error) {
        fail(error);
      } finally {
        closeOverlay(owner);
      }
    });
  }

  key(e, cx) {
    const tools = this.tools ?? [];
    const m = e.modifiers;
    const typed = !m.control && !m.alt && !m.platform ? e.key_char ?? (e.key.length === 1 ? e.key : undefined) : undefined;
    const byKey = typed && tools.find((t) => t.key === typed);
    if (byKey) this.choose(byKey, cx);
    else if (e.key === "down") this.at = (this.at + 1) % tools.length;
    else if (e.key === "up") this.at = (this.at - 1 + tools.length) % tools.length;
    else if (e.key === "enter") this.choose(tools[this.at], cx);
    else if (e.key === "escape") closeOverlay(this.copy.overlay);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  async close() {
    if (this.copy.role !== "sentinel") return;
    const mem = memory();
    if (mem.dialog === this.copy.overlay) delete mem.dialog;
    if (alive(this.copy.terminal)) await run("terminal.kill", { terminal: this.copy.terminal });
    if (this.copy.previousPane) run("pane.focus", { pane: this.copy.previousPane });
  }

  render() {
    if (this.copy.role === "sentinel") {
      // The program exited and --rm removed its terminal: close the dialog.
      // Live data lags behind `hc run`, so only after seeing it alive once.
      if (alive(this.copy.terminal)) this.seen = true;
      else if (this.seen) closeOverlay(this.copy.overlay);
      return div();
    }
    const t = theme();
    const root = v_flex().id("popup-tools").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).p(6).gap(2).bg(t.popover).text_size(13).text_color(t.foreground);
    if (!this.tools || this.hidden) return root;
    return root.children(this.tools.map((tool, i) =>
      h_flex().id(`tool-${i}`).h(34).flex_none().px(10).gap(10).rounded(7).items_center().cursor_pointer()
        .when(i === this.at, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.choose(tool, cx))
        .child(h_flex().size(20).flex_none().rounded(5).items_center().justify_center().bg(t.accent)
          .text_color(t.accent_foreground).text_size(12).font_semibold().child(tool.key))
        .child(div().flex_none().child(tool.name))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(tool.command))));
  }
}
