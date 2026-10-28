export const DEFAULT_INVENTORY = [
  {
    name: "PHP",
    version: "8.3.30",
    environment: "produccion",
    criticality: 5,
    cpe: "php:php",
    eolProduct: "php",
    keywords: ["php"],
    packages: [{ ecosystem: "Packagist", name: "php/php" }],
    feed: null,
    role: "Runtime web (PHP-FPM)",
    port: 9000,
  },
  {
    name: "Joomla!",
    version: "5.3.2",
    environment: "produccion",
    criticality: 4,
    cpe: "joomla:joomla",
    eolProduct: "joomla",
    keywords: ["joomla"],
    packages: [],
    feed: "Joomla Security",
    role: "Portal Joomla",
    port: 443,
  },
  {
    name: "WordPress",
    version: "7.1.3",
    environment: "produccion",
    criticality: 4,
    cpe: "wordpress:wordpress",
    eolProduct: "wordpress",
    keywords: ["wordpress"],
    packages: [],
    feed: "WordPress Security",
    role: "Portal WordPress",
    port: 443,
  },
  {
    name: "Node.js",
    version: "22.18.0",
    environment: "produccion",
    criticality: 3,
    cpe: "nodejs:node.js",
    eolProduct: "nodejs",
    keywords: ["node.js", "nodejs"],
    packages: [],
    feed: null,
    role: "Aplicaciones Node",
    port: 3000,
  },
  {
    name: "MySQL",
    version: "8.0.40",
    environment: "produccion",
    criticality: 5,
    cpe: "mysql:mysql",
    eolProduct: "mysql",
    keywords: ["mysql"],
    packages: [],
    feed: null,
    role: "Base de datos",
    port: 3306,
  },
];

export const DEFAULT_WATCH = ["Apache HTTP Server", "nginx"];

export const DEFAULT_FEEDS = [
  {
    name: "Joomla Security",
    url: "https://developer.joomla.org/security-centre.feed?type=rss",
  },
  {
    name: "WordPress Security",
    url: "https://wordpress.org/news/category/security/feed/",
  },
];

export const DEFAULT_SETTINGS = {
  refreshMinutes: 60,
  windowDays: 3,
  notifyMinSeverity: "high",
  webhookUrl: "",
};

export const SEED_ADVISORIES = [
  {
    software: "PHP",
    cve: "CVE-2026-109618",
    cvss: 9.2,
    severity: "CRITICAL",
    kev: false,
    title: "PHP: ejecucion remota de codigo no autenticado (RCE)",
    url: "https://www.php.net/ChangeLog-8.php",
    affected: { before: "8.3.36" },
  },
  {
    software: "PHP",
    cve: "CVE-2026-109619",
    cvss: 9.2,
    severity: "CRITICAL",
    kev: false,
    title: "PHP: ejecucion remota de codigo no autenticado (RCE)",
    url: "https://www.php.net/ChangeLog-8.php",
    affected: { before: "8.3.36" },
  },
  {
    software: "MySQL",
    cve: "",
    cvss: 7.5,
    severity: "HIGH",
    kev: false,
    title: "MySQL 8.0 alcanzo fin de soporte (EOL)",
    url: "https://endoflife.date/mysql",
    affected: { eol: "8.0" },
  },
];

export function defaultConfig() {
  return {
    inventory: DEFAULT_INVENTORY.map((item) => ({ ...item })),
    watch: [...DEFAULT_WATCH],
    feeds: DEFAULT_FEEDS.map((item) => ({ ...item })),
    settings: { ...DEFAULT_SETTINGS },
  };
}

