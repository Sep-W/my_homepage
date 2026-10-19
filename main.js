"use strict";

const { Plugin, ItemView, PluginSettingTab, Setting, Notice, MarkdownRenderChild } = require("obsidian");
const { normalize, parseLinks } = require("./core/model");
const modules = require("./modules");
const VIEW = "my-homepage-view";

class Dashboard {
  constructor(plugin, el) { this.plugin = plugin; this.el = el; this.cleanups = []; }
  clear() {
    for (const dispose of this.cleanups.splice(0)) {
      try { dispose(); } catch (error) { console.error("[我的主页] 清理失败", error); }
    }
    this.el.empty();
  }
  render() {
    this.clear();
    this.el.addClass("mh-root");
    this.el.style.setProperty("--mh-accent", this.plugin.settings.accent);
    const header = this.el.createDiv({ cls: "mh-header" });
    const heading = header.createDiv();
    heading.createDiv({ text: "PERSONAL SPACE", cls: "mh-eyebrow" });
    heading.createEl("h1", { text: this.plugin.settings.title });
    heading.createEl("p", { text: this.plugin.settings.subtitle, cls: "mh-muted" });
    const settings = header.createEl("button", { text: "设置主页", cls: "mh-settings" });
    settings.onclick = () => this.plugin.openConfiguration();
    const grid = this.el.createDiv({ cls: "mh-grid" });
    grid.style.setProperty("--mh-columns", String(this.plugin.settings.columns));
    let count = 0;
    for (const id of this.plugin.settings.order) {
      if (!this.plugin.settings.visible[id]) continue;
      const module = modules.find(item => item.id === id);
      if (!module) continue;
      count++;
      const card = grid.createEl("section", { cls: `mh-card mh-card-${id}` });
      card.createEl("h2", { text: module.name });
      const body = card.createDiv();
      try { module.render({ el: body, plugin: this.plugin, cleanup: fn => this.cleanups.push(fn) }); }
      catch (error) { body.createDiv({ text: "模块暂时无法显示，请查看控制台。", cls: "mh-muted" }); console.error(error); }
    }
    if (!count) grid.createDiv({ text: "所有模块已隐藏，可在设置中重新开启。", cls: "mh-muted" });
  }
  dispose() { this.clear(); this.plugin.dashboards.delete(this); }
}

class HomepageView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW; }
  getDisplayText() { return "我的主页"; }
  getIcon() { return "home"; }
  async onOpen() { this.dashboard = this.plugin.mount(this.contentEl); }
  async onClose() { this.dashboard?.dispose(); }
}

class HomepageBlock extends MarkdownRenderChild {
  constructor(el, plugin) { super(el); this.plugin = plugin; }
  onload() { this.dashboard = this.plugin.mount(this.containerEl); }
  onunload() { this.dashboard?.dispose(); }
}

class HomepageSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const el = this.containerEl;
    el.empty();
    el.createEl("h2", { text: "我的主页" });
    this.plugin.renderSettings(el, () => this.display());
  }
}

class ConfigurationView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return "my-homepage-settings"; }
  getDisplayText() { return "主页设置"; }
  getIcon() { return "settings"; }
  async onOpen() { this.draw(); }
  draw() {
    this.contentEl.empty();
    this.contentEl.addClass("mh-configuration");
    this.contentEl.createEl("h1", { text: "主页设置" });
    this.plugin.renderSettings(this.contentEl, () => this.draw());
  }
}

module.exports = class MyHomepagePlugin extends Plugin {
  async onload() {
    this.settings = normalize(await this.loadData());
    this.dashboards = new Set();
    this.writeQueue = Promise.resolve();
    this.registerView(VIEW, leaf => new HomepageView(leaf, this));
    this.registerView("my-homepage-settings", leaf => new ConfigurationView(leaf, this));
    this.addSettingTab(new HomepageSettings(this.app, this));
    this.addRibbonIcon("home", "打开我的主页", () => this.openHome().catch(error => this.report(error)));
    this.addCommand({ id: "open", name: "打开主页", callback: () => this.openHome().catch(error => this.report(error)) });
    this.addCommand({ id: "configure", name: "设置主页", callback: () => this.openConfiguration() });
    this.registerMarkdownCodeBlockProcessor("my-homepage", (_source, el, ctx) => ctx.addChild(new HomepageBlock(el, this)));
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openOnStartup) this.openHome().catch(error => this.report(error));
    });
  }
  mount(el) {
    const dashboard = new Dashboard(this, el);
    this.dashboards.add(dashboard); dashboard.render(); return dashboard;
  }
  refresh() { for (const dashboard of this.dashboards) dashboard.render(); }
  tasksChanged(source) {
    this.persist();
    for (const dashboard of this.dashboards) {
      if (!dashboard.el.contains(source)) dashboard.render();
    }
  }
  report(error) { console.error("[我的主页]", error); new Notice("操作失败，请检查文件权限或查看控制台。"); }
  persist() {
    // Capture each state and serialize writes so older writes cannot overwrite newer ones.
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    this.writeQueue = this.writeQueue.then(() => this.saveData(snapshot)).catch(error => this.report(error));
    return this.writeQueue;
  }
  change(key, value) { this.settings[key] = value; this.persist(); this.refresh(); }
  async openHome() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW)[0] || this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  openConfiguration() {
    const existing = this.app.workspace.getLeavesOfType("my-homepage-settings")[0];
    const leaf = existing || this.app.workspace.getLeaf(true);
    Promise.resolve(leaf.setViewState({ type: "my-homepage-settings", active: true }))
      .then(() => this.app.workspace.revealLeaf(leaf)).catch(error => this.report(error));
  }
  renderSettings(el, redraw) {
    new Setting(el).setName("主页标题").addText(input => input.setValue(this.settings.title).onChange(value => this.change("title", value)));
    new Setting(el).setName("一句话介绍").addText(input => input.setValue(this.settings.subtitle).onChange(value => this.change("subtitle", value)));
    new Setting(el).setName("启动时打开主页").setDesc("打开仓库后自动显示主页。").addToggle(toggle => toggle.setValue(this.settings.openOnStartup).onChange(value => this.change("openOnStartup", value)));
    new Setting(el).setName("桌面列数").setDesc("窄屏始终使用单列。").addDropdown(dropdown => dropdown.addOption("1", "单列").addOption("2", "双列").setValue(String(this.settings.columns)).onChange(value => this.change("columns", Number(value))));
    new Setting(el).setName("主题色").addColorPicker(picker => picker.setValue(this.settings.accent).onChange(value => this.change("accent", value)));
    new Setting(el).setName("最近笔记数量").addSlider(slider => slider.setLimits(1, 20, 1).setValue(this.settings.recentCount).setDynamicTooltip().onChange(value => this.change("recentCount", value)));
    el.createEl("h3", { text: "模块与顺序" });
    for (const [index, id] of this.settings.order.entries()) {
      const module = modules.find(item => item.id === id);
      const row = new Setting(el).setName(module.name);
      row.addToggle(toggle => toggle.setValue(this.settings.visible[id]).onChange(value => { this.settings.visible[id] = value; this.persist(); this.refresh(); }));
      const move = offset => {
        const order = [...this.settings.order];
        [order[index], order[index + offset]] = [order[index + offset], order[index]];
        this.change("order", order); redraw();
      };
      row.addButton(button => button.setButtonText("上移").setDisabled(index === 0).onClick(() => move(-1)));
      row.addButton(button => button.setButtonText("下移").setDisabled(index === this.settings.order.length - 1).onClick(() => move(1)));
    }
    el.createEl("h3", { text: "快捷入口" });
    let draft = this.settings.links.map(link => `${link.label} | ${link.path}`).join("\n");
    const linkSetting = new Setting(el).setName("每行一个入口").setDesc("格式：名称 | 文件夹/笔记.md。仅支持当前仓库的 Markdown 笔记。");
    linkSetting.addTextArea(input => { input.setValue(draft).setPlaceholder("收件箱 | 笔记/收件箱.md\n学习计划 | 学习/计划.md").onChange(value => { draft = value; }); input.inputEl.rows = 6; });
    new Setting(el).setName("保存快捷入口").addButton(button => button.setButtonText("保存").setCta().onClick(() => {
      try { this.change("links", parseLinks(draft)); new Notice("快捷入口已保存"); }
      catch (error) { new Notice(error.message); }
    }));
    el.createEl("p", { text: "数据保存在当前仓库的插件 data.json 中，不主动联网。待办独立保存，不会修改笔记中的任务。", cls: "mh-muted" });
  }
  onunload() {
    for (const dashboard of [...this.dashboards]) dashboard.dispose();
  }
};
