"use strict";

const IDS = ["clock", "links", "tasks", "recent"];
const DEFAULTS = {
  title: "我的主页", subtitle: "把注意力留给重要的事。", openOnStartup: false,
  columns: 2, recentCount: 6, accent: "#729b89", order: IDS,
  visible: { clock: true, links: true, tasks: true, recent: true },
  links: [], tasks: []
};

function normalize(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const order = Array.isArray(value.order) ? value.order.filter(id => IDS.includes(id)) : [];
  return {
    title: typeof value.title === "string" ? value.title : DEFAULTS.title,
    subtitle: typeof value.subtitle === "string" ? value.subtitle : DEFAULTS.subtitle,
    openOnStartup: value.openOnStartup === true,
    columns: value.columns === 1 ? 1 : 2,
    recentCount: Math.max(1, Math.min(20, Math.floor(Number(value.recentCount) || 6))),
    accent: /^#[0-9a-f]{6}$/i.test(value.accent || "") ? value.accent : DEFAULTS.accent,
    order: [...new Set([...order, ...IDS])],
    visible: Object.fromEntries(IDS.map(id => [id, value.visible?.[id] !== false])),
    links: Array.isArray(value.links) ? value.links.filter(item => item && typeof item.label === "string" && typeof item.path === "string").map(item => ({ label: item.label, path: item.path })) : [],
    tasks: Array.isArray(value.tasks) ? value.tasks.filter(item => item && typeof item.id === "string" && typeof item.text === "string").map(item => ({ id: item.id, text: item.text, done: item.done === true })) : []
  };
}

function parseLinks(text) {
  const links = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf("|");
    if (separator < 1 || !line.slice(separator + 1).trim()) throw new Error("每行请使用：名称 | 仓库内笔记路径");
    links.push({ label: line.slice(0, separator).trim(), path: line.slice(separator + 1).trim() });
  }
  return links;
}

module.exports = { IDS, DEFAULTS, normalize, parseLinks };
