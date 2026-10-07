"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AmazonIcon,
  AppleIcon,
  AwsLogo,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ExternalIcon,
  GithubIcon,
  GlobeIcon,
  GoogleIcon,
  InfoIcon,
  KeyboardIcon,
  MoonIcon,
  RefreshIcon,
  SearchIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import type {
  BindImportResult,
  DnsRecord,
  HostedZone,
  Paginated,
  RecordInput,
  RecordType,
  User,
  ZoneInput,
} from "@/lib/types";

const TOKEN_KEY = "route53_clone_token";
const THEME_KEY = "route53_clone_theme";

const EMPTY_ZONES: Paginated<HostedZone> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 10,
  pages: 1,
};

const EMPTY_RECORDS: Paginated<DnsRecord> = {
  items: [],
  total: 0,
  page: 1,
  page_size: 10,
  pages: 1,
};

const RECORD_TYPES: RecordType[] = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "NS",
  "PTR",
  "SRV",
  "CAA",
];

const RECORD_TYPE_DESCRIPTIONS: Record<
  RecordType,
  { title: string; hint: string; example: string }
> = {
  A: {
    title: "IPv4 address",
    hint: "Routes traffic to an IPv4 address in dotted-decimal format (e.g. 192.0.2.1).",
    example: "192.0.2.1",
  },
  AAAA: {
    title: "IPv6 address",
    hint: "Routes traffic to an IPv6 address in colon-separated hexadecimal format.",
    example: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
  },
  CNAME: {
    title: "Canonical name",
    hint: "Routes traffic to another domain name. In Route 53, CNAME records are not allowed at the zone apex.",
    example: "web.example.com",
  },
  TXT: {
    title: "Text",
    hint: "Holds arbitrary text, such as SPF, DKIM, or domain verification strings.",
    example: '"v=spf1 include:_spf.google.com ~all"',
  },
  MX: {
    title: "Mail exchange",
    hint: "Specifies mail servers: <priority> <mail-server-host> (e.g. 10 mail.example.com).",
    example: "10 mail.example.com",
  },
  NS: {
    title: "Name server",
    hint: "Identifies authoritative name servers for the hosted zone.",
    example: "ns-1.awsdns-01.org",
  },
  PTR: {
    title: "Pointer",
    hint: "Maps an IP address back to a domain name (reverse DNS lookup).",
    example: "host.example.com",
  },
  SRV: {
    title: "Service locator",
    hint: "Defines location of servers: <priority> <weight> <port> <target>.",
    example: "10 5 443 sip.example.com",
  },
  CAA: {
    title: "Certification Authority Authorization",
    hint: 'Restricts certificate issuance: <flags> <tag> "<value>" (e.g. 0 issue "letsencrypt.org").',
    example: '0 issue "letsencrypt.org"',
  },
};

const SAMPLE_BIND_ZONE = `; BIND zone file for Route 53 import
$ORIGIN example.com.
$TTL 300
@       IN A     192.0.2.1
www     IN A     192.0.2.2
api     IN CNAME www.example.com.
mail    IN MX    10 mail.example.com.
_sip    IN SRV   10 5 5060 sip.example.com.
@       IN TXT   "v=spf1 include:_spf.google.com ~all"
@       IN CAA   0 issue "letsencrypt.org"
`;

type Section =
  | "dashboard"
  | "hosted-zones"
  | "traffic-policies"
  | "health-checks"
  | "resolver"
  | "profiles";

type Notice = { kind: "success" | "error"; message: string };

function normalizeZoneName(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getRecordPrefix(recordName: string, zoneName: string): string {
  const cleanRecord = recordName.replace(/\.$/, "");
  const cleanZone = zoneName.replace(/\.$/, "");
  if (cleanRecord === cleanZone) return "";
  if (cleanRecord.endsWith(`.${cleanZone}`)) {
    return cleanRecord.slice(0, -(cleanZone.length + 1));
  }
  return cleanRecord;
}

function getZoneNameservers(zoneId: number): string[] {
  const seed = (zoneId * 137 + 42) % 1000;
  return [
    `ns-${(seed % 900) + 100}.awsdns-${((seed + 15) % 60) + 10}.com`,
    `ns-${((seed + 250) % 900) + 100}.awsdns-${((seed + 32) % 60) + 10}.net`,
    `ns-${((seed + 500) % 900) + 100}.awsdns-${((seed + 48) % 60) + 10}.org`,
    `ns-${((seed + 750) % 900) + 100}.awsdns-${((seed + 5) % 60) + 10}.co.uk`,
  ];
}

function Login({
  onLogin,
}: {
  onLogin: (token: string, user: User) => void;
}) {
  const [email, setEmail] = useState("admin@example.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const emailToUse = email.trim() || "admin@example.com";
      const result = await api.login(emailToUse, "route53demo");
      localStorage.setItem(TOKEN_KEY, result.token);
      onLogin(result.token, result.user);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Sign in failed. Default demo: admin@example.com / route53demo"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleProviderLogin(provider: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api.login("admin@example.com", "route53demo");
      localStorage.setItem(TOKEN_KEY, result.token);
      onLogin(result.token, result.user);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : `Sign in with ${provider} failed.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <header className="login-topbar">
        <div className="login-aws-logo" title="Amazon Web Services">
          <AwsLogo height={44} variant="white" width={74} />
        </div>
      </header>

      <div className="login-shell">
        <section className="login-card">
          <h1 className="login-card-title">Get started</h1>

          {error && <div className="alert error">{error}</div>}

          <form onSubmit={submit}>
            <label className="login-field-label">Email</label>
            <input
              autoComplete="username"
              className="login-input"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="username@example.com"
              required
              type="email"
              value={email}
            />

            <button
              className="login-continue-btn"
              disabled={busy}
              type="submit"
            >
              {busy ? "Continuing..." : "Continue"}
            </button>
          </form>

          <div className="login-divider">
            <span>OR</span>
          </div>

          <button
            className="login-provider-btn"
            disabled={busy}
            onClick={() => handleProviderLogin("Google")}
            type="button"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          <button
            className="login-provider-btn"
            disabled={busy}
            onClick={() => handleProviderLogin("Apple")}
            type="button"
          >
            <AppleIcon />
            <span>Continue with Apple</span>
          </button>

          <button
            className="login-provider-btn"
            disabled={busy}
            onClick={() => handleProviderLogin("GitHub")}
            type="button"
          >
            <GithubIcon />
            <span>Continue with GitHub</span>
          </button>

          <button
            className="login-provider-btn"
            disabled={busy}
            onClick={() => handleProviderLogin("Amazon")}
            type="button"
          >
            <AmazonIcon />
            <span>Continue with Amazon</span>
          </button>

          <div
            className="login-demo-pill"
            onClick={() => {
              setEmail("admin@example.com");
              handleProviderLogin("Demo");
            }}
            title="Click to sign in with demo credentials immediately"
          >
            <InfoIcon />
            <span>
              Pre-configured: <b>admin@example.com</b> (Click to sign in)
            </span>
          </div>
        </section>
      </div>

      <footer className="login-footer">
        <div className="login-footer-links">
          <span>Privacy</span>
          <span>|</span>
          <span>Site Terms</span>
          <span>|</span>
          <span>Cookie Preferences</span>
        </div>
        <div className="login-copyright">
          © 2026, Amazon Web Services, Inc. or its affiliates.
        </div>
      </footer>
    </main>
  );
}

function Header({
  user,
  theme,
  section,
  hostedZonesCount = 3,
  onNavigate,
  onLogout,
  onToggleTheme,
  onOpenShortcuts,
  onSearchGlobal,
  onCreateZone,
}: {
  user: User;
  theme: "light" | "dark";
  section?: Section;
  hostedZonesCount?: number;
  onNavigate?: (section: Section) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  onSearchGlobal: (query: string) => void;
  onCreateZone?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) {
      onSearchGlobal(query.trim());
    }
  }

  return (
    <>
      <header className="portal-header">
        {/* Layer 1: Top Utility Bar */}
        <div className="portal-utility-bar">
          <div className="utility-bar-left">
            <span className="utility-badge">
              <span className="pulse-green" /> AWS Management Console
            </span>
          </div>
          <div className="utility-bar-right">
            <button className="utility-item" type="button">
              <GlobeIcon /> English <span>⌵</span>
            </button>
            <button
              className="utility-item"
              onClick={onOpenShortcuts}
              type="button"
            >
              Shortcuts <span>[?]</span>
            </button>
            <button
              className="utility-item"
              onClick={() => setMenuOpen((value) => !value)}
              type="button"
            >
              My account <span>⌵</span>
            </button>
            <div
              className="utility-avatar"
              onClick={() => setMenuOpen((value) => !value)}
              title={user.email}
            >
              <span>{user.name ? user.name[0].toUpperCase() : "S"}</span>
            </div>
          </div>
        </div>

        {/* Layer 2: Main Navigation Bar */}
        <div className="portal-nav-bar">
          <div className="portal-nav-left">
            <div
              className="portal-logo"
              onClick={() => onNavigate?.("dashboard")}
              style={{ cursor: "pointer" }}
              title="AWS Route 53 Home"
            >
              <AwsLogo
                height={38}
                variant={theme === "dark" ? "white" : "dark"}
                width={64}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "inherit" }}>
                Route 53
              </span>
              <span style={{ fontSize: "12px", color: "var(--aws-muted)", background: "var(--aws-bg)", padding: "2px 8px", borderRadius: "12px" }}>
                DNS Console
              </span>
            </div>
          </div>

          <div className="portal-nav-right">
            <form className="portal-search-form" onSubmit={handleSearchSubmit}>
              <SearchIcon />
              <input
                id="global-search-input"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources [Alt+S]"
                ref={searchInputRef}
                type="text"
                value={query}
              />
              <kbd>[Alt+S]</kbd>
            </form>
            <button
              aria-label="Toggle theme"
              className="portal-action-btn"
              onClick={onToggleTheme}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              type="button"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              aria-label="Keyboard shortcuts"
              className="portal-action-btn"
              onClick={onOpenShortcuts}
              title="Keyboard shortcuts [?]"
              type="button"
            >
              <KeyboardIcon />
            </button>
            <div className="portal-region-badge">
              <GlobeIcon /> Global
            </div>
            <div className="portal-role-badge">
              <span>IAM: AdministratorAccess</span>
            </div>
            <button
              className="portal-create-btn"
              onClick={onCreateZone || (() => onNavigate?.("hosted-zones"))}
              type="button"
            >
              + Create hosted zone
            </button>
          </div>
        </div>

        {/* Layer 3: Route 53 Sub-Nav Strip */}
        <div className="portal-subnav-container">
          <div className="portal-subnav-card">
            <div className="portal-subnav-left">
              <div className="portal-subnav-title">
                <strong>Amazon Route 53</strong>
              </div>
              <nav className="portal-subnav-tabs">
                <button
                  className={section === "dashboard" ? "active" : ""}
                  onClick={() => onNavigate?.("dashboard")}
                  type="button"
                >
                  Overview
                </button>
                <button
                  className={section === "hosted-zones" ? "active" : ""}
                  onClick={() => onNavigate?.("hosted-zones")}
                  type="button"
                >
                  Hosted zones <span className="tab-count">({hostedZonesCount})</span>
                </button>
                <button
                  className={section === "health-checks" ? "active" : ""}
                  onClick={() => onNavigate?.("health-checks")}
                  type="button"
                >
                  Health checks <span className="tab-count">(3)</span>
                </button>
                <button
                  className={section === "traffic-policies" ? "active" : ""}
                  onClick={() => onNavigate?.("traffic-policies")}
                  type="button"
                >
                  Traffic policies <span className="tab-count">(1)</span>
                </button>
                <button
                  className={section === "resolver" ? "active" : ""}
                  onClick={() => onNavigate?.("resolver")}
                  type="button"
                >
                  Resolver VPCs <span className="tab-count">(2)</span>
                </button>
                <button
                  className={section === "profiles" ? "active" : ""}
                  onClick={() => onNavigate?.("profiles")}
                  type="button"
                >
                  Profiles <span className="tab-count">(1)</span>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="account-menu">
          <strong>{user.name || "Sarthak Mishra (Admin)"}</strong>
          <span>{user.email}</span>
          <div
            style={{
              fontSize: "11px",
              color: "var(--aws-muted)",
              marginBottom: "8px",
              lineHeight: "1.5",
            }}
          >
            Account ID: <b>1234-5678-9012</b>
            <br />
            IAM Role: <b>AdministratorAccess</b>
          </div>
          <hr />
          <button
            onClick={() => {
              setMenuOpen(false);
              onToggleTheme();
            }}
            type="button"
          >
            Theme: {theme === "light" ? "🌙 Switch to Dark" : "☀️ Switch to Light"}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onOpenShortcuts();
            }}
            type="button"
          >
            Keyboard shortcuts
          </button>
          <hr />
          <button
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
            style={{ color: "var(--aws-red)" }}
            type="button"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}

function Sidebar({
  section,
  onNavigate,
  hostedZonesCount = 3,
}: {
  section: Section;
  onNavigate: (section: Section) => void;
  hostedZonesCount?: number;
}) {
  const groups: Array<{
    title?: string;
    items: Array<{ id: Section; label: string; count?: number }>;
  }> = [
    { items: [{ id: "dashboard", label: "Dashboard" }] },
    {
      title: "DNS management",
      items: [
        { id: "hosted-zones", label: "Hosted zones", count: hostedZonesCount },
        { id: "health-checks", label: "Health checks", count: 3 },
        { id: "traffic-policies", label: "Traffic policies", count: 1 },
      ],
    },
    {
      title: "Resolver",
      items: [
        { id: "resolver", label: "Resolver VPCs", count: 2 },
        { id: "profiles", label: "Profiles", count: 1 },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="service-title">
        <span className="route53-mark small">53</span>
        <strong>Route 53</strong>
      </div>
      {groups.map((group, index) => (
        <div className="nav-group" key={group.title ?? index}>
          {group.title && <h3>{group.title}</h3>}
          {group.items.map((item) => (
            <button
              className={section === item.id ? "active" : ""}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: section === item.id ? "var(--aws-blue-dark)" : "var(--aws-muted)",
                      fontWeight: 600,
                    }}
                  >
                    ({item.count})
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      ))}
      <a
        className="feedback-link"
        href="https://docs.aws.amazon.com/route53/"
        rel="noreferrer"
        target="_blank"
      >
        AWS Route 53 Docs <ExternalIcon />
      </a>
    </aside>
  );
}

function Breadcrumb({
  section,
  zone,
  onNavigate,
  onBack,
}: {
  section?: Section;
  zone?: HostedZone;
  onNavigate?: (section: Section) => void;
  onBack?: () => void;
}) {
  return (
    <div className="breadcrumb">
      <button onClick={() => onNavigate?.("dashboard")} type="button">
        Route 53
      </button>
      <ChevronIcon />
      {zone ? (
        <>
          <button onClick={onBack} type="button">
            Hosted zones
          </button>
          <ChevronIcon />
          <span>{zone.name}</span>
        </>
      ) : section === "dashboard" ? (
        <span>Dashboard</span>
      ) : section === "hosted-zones" ? (
        <span>Hosted zones</span>
      ) : (
        <span>{section ?? "Console"}</span>
      )}
    </div>
  );
}

function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        title="Previous page"
        type="button"
      >
        ‹
      </button>
      <span>
        Page <b>{page}</b> of {Math.max(pages, 1)}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        title="Next page"
        type="button"
      >
        ›
      </button>
    </div>
  );
}

function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="modal confirm-modal" role="dialog">
        <div className="modal-header">
          <h2>{title}</h2>
          <button aria-label="Close" onClick={onCancel} type="button">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn" disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="btn danger" disabled={busy} onClick={onConfirm} type="button">
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="modal wide-modal" role="dialog">
        <div className="modal-header">
          <h2>
            <KeyboardIcon /> Keyboard shortcuts
          </h2>
          <button aria-label="Close" onClick={onClose} type="button">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-intro">
            Use these shortcuts to navigate and manage your Route 53 resources quickly.
          </p>
          <table className="shortcuts-table">
            <tbody>
              <tr>
                <td>
                  <kbd>Alt + S</kbd> or <kbd>/</kbd>
                </td>
                <td>Focus search or record filter input</td>
              </tr>
              <tr>
                <td>
                  <kbd>Alt + C</kbd>
                </td>
                <td>Create hosted zone or create DNS record</td>
              </tr>
              <tr>
                <td>
                  <kbd>Esc</kbd>
                </td>
                <td>Close open modal, dialog, or dropdown menu</td>
              </tr>
              <tr>
                <td>
                  <kbd>?</kbd>
                </td>
                <td>Open this keyboard shortcuts cheat sheet</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn primary" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function ZoneForm({
  zone,
  busy,
  onCancel,
  onSubmit,
}: {
  zone?: HostedZone;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ZoneInput) => Promise<void>;
}) {
  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [zoneType, setZoneType] = useState<"public" | "private">(
    zone?.zone_type ?? "public",
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      name: normalizeZoneName(name),
      description,
      zone_type: zoneType,
    });
  }

  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="modal" role="dialog">
        <div className="modal-header">
          <h2>{zone ? "Edit hosted zone" : "Create hosted zone"}</h2>
          <button aria-label="Close" onClick={onCancel} type="button">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="modal-intro">
              A hosted zone tells Route 53 how you want to route traffic for a domain.
            </p>
            <label>
              Domain name
              <input
                autoFocus
                disabled={Boolean(zone)}
                onChange={(event) => setName(event.target.value)}
                placeholder="example.com"
                required
                value={name}
              />
              <small>Enter a registered domain name (e.g. example.com) without http://.</small>
            </label>
            <label>
              Description <span className="optional">- optional</span>
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Production DNS zone"
                rows={3}
                value={description}
              />
            </label>
            <fieldset>
              <legend>Type</legend>
              <label className="radio-card">
                <input
                  checked={zoneType === "public"}
                  name="zone-type"
                  onChange={() => setZoneType("public")}
                  type="radio"
                />
                <span>
                  <b>Public hosted zone</b>
                  <small>Routes internet traffic to your resources.</small>
                </span>
              </label>
              <label className="radio-card">
                <input
                  checked={zoneType === "private"}
                  name="zone-type"
                  onChange={() => setZoneType("private")}
                  type="radio"
                />
                <span>
                  <b>Private hosted zone</b>
                  <small>Routes traffic within one or more VPCs.</small>
                </span>
              </label>
            </fieldset>
          </div>
          <div className="modal-footer">
            <button className="btn" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Saving..." : zone ? "Save changes" : "Create hosted zone"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RecordForm({
  zone,
  record,
  busy,
  onCancel,
  onSubmit,
}: {
  zone: HostedZone;
  record?: DnsRecord;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: RecordInput) => Promise<void>;
}) {
  const [subdomain, setSubdomain] = useState(() =>
    record ? getRecordPrefix(record.name, zone.name) : "",
  );
  const [type, setType] = useState<RecordType>(record?.type ?? "A");
  const [value, setValue] = useState(record?.value ?? "");
  const [ttl, setTtl] = useState(record?.ttl ?? 300);

  const fullRecordName = useMemo(() => {
    const trimmed = subdomain.trim();
    if (!trimmed) return zone.name;
    return trimmed.endsWith(zone.name) ? trimmed : `${trimmed}.${zone.name}`;
  }, [subdomain, zone.name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      name: fullRecordName,
      type,
      value: value.trim(),
      ttl,
      routing_policy: "Simple",
      set_identifier: null,
    });
  }

  const typeMeta = RECORD_TYPE_DESCRIPTIONS[type];

  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="modal wide-modal" role="dialog">
        <div className="modal-header">
          <h2>{record ? "Edit record" : "Create record"}</h2>
          <button aria-label="Close" onClick={onCancel} type="button">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <label>
                Record name
                <div className="suffix-input">
                  <input
                    autoFocus
                    onChange={(event) => setSubdomain(event.target.value)}
                    placeholder="www"
                    value={subdomain}
                  />
                  <span>.{zone.name}</span>
                </div>
                <small>
                  Full DNS name: <b>{fullRecordName}</b>
                  <br />
                  Leave blank to create a record for the apex ({zone.name}).
                </small>
              </label>
              <label>
                Record type
                <select
                  onChange={(event) => setType(event.target.value as RecordType)}
                  value={type}
                >
                  {RECORD_TYPES.map((recordType) => (
                    <option key={recordType} value={recordType}>
                      {recordType} - {RECORD_TYPE_DESCRIPTIONS[recordType].title}
                    </option>
                  ))}
                </select>
                <small>{typeMeta.hint}</small>
              </label>
            </div>

            <label>
              Value / Route traffic to
              <textarea
                onChange={(event) => setValue(event.target.value)}
                placeholder={typeMeta.example}
                required
                rows={4}
                value={value}
              />
              <small>
                Example: <code>{typeMeta.example}</code>
                <br />
                Enter one value per line when using multiple values.
              </small>
            </label>

            <div className="form-grid">
              <label>
                TTL (seconds)
                <input
                  min={0}
                  onChange={(event) => setTtl(Number(event.target.value))}
                  required
                  type="number"
                  value={ttl}
                />
                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                  {[60, 300, 900, 3600, 86400].map((preset) => (
                    <button
                      className="btn icon-btn"
                      key={preset}
                      onClick={() => setTtl(preset)}
                      style={{ fontSize: "11px", padding: "2px 6px" }}
                      type="button"
                    >
                      {preset === 300 ? "300 (default)" : preset}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                Routing policy
                <select disabled value="Simple">
                  <option value="Simple">Simple routing</option>
                </select>
                <small>Routes traffic directly to a single resource or list of values.</small>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Saving..." : record ? "Save changes" : "Create records"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ImportBindModal({
  zone,
  busy,
  onCancel,
  onSubmit,
}: {
  zone: HostedZone;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (content: string, replaceExisting: boolean) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setContent(text);
      }
    };
    reader.readAsText(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    await onSubmit(content, replaceExisting);
  }

  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="modal wide-modal" role="dialog">
        <div className="modal-header">
          <h2>
            <UploadIcon /> Import BIND zone file ({zone.name})
          </h2>
          <button aria-label="Close" onClick={onCancel} type="button">
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="modal-intro">
              Import DNS records from standard BIND format text or an uploaded zone file.
              Supported record types: <b>A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA</b>.
            </p>

            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <label className="btn" style={{ margin: 0, fontWeight: "normal", cursor: "pointer" }}>
                <UploadIcon /> Upload .zone file
                <input
                  accept=".zone,.txt,.bind"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  type="file"
                />
              </label>
              <button
                className="btn"
                onClick={() => setContent(SAMPLE_BIND_ZONE.replace(/example\.com/g, zone.name))}
                type="button"
              >
                Insert sample BIND template
              </button>
            </div>

            <label>
              Zone file content
              <textarea
                onChange={(e) => setContent(e.target.value)}
                placeholder={SAMPLE_BIND_ZONE}
                required
                rows={10}
                style={{ fontFamily: "Consolas, monospace", fontSize: "13px" }}
                value={content}
              />
            </label>

            <label
              className="checkbox-cell"
              style={{ display: "flex", alignItems: "center", gap: "8px", width: "auto" }}
            >
              <input
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                type="checkbox"
              />
              <span>Replace existing records in this hosted zone</span>
            </label>
          </div>
          <div className="modal-footer">
            <button className="btn" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !content.trim()} type="submit">
              {busy ? "Importing..." : "Import records"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function HostedZoneDetailsPanel({
  zone,
  onCopy,
}: {
  zone: HostedZone;
  onCopy: (text: string, label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const nameservers = useMemo(() => getZoneNameservers(zone.id), [zone.id]);
  const zoneIdFormatted = `Z${String(zone.id).padStart(12, "0")}`;

  return (
    <section className="zone-details-card">
      <div
        className={`zone-details-header ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronIcon />
        <span>Hosted zone details</span>
      </div>
      {open && (
        <div className="zone-details-body">
          <div className="details-grid">
            <div className="detail-item">
              <strong>Hosted zone name</strong>
              <span>{zone.name}</span>
            </div>
            <div className="detail-item">
              <strong>Hosted zone ID</strong>
              <div>
                <span>{zoneIdFormatted}</span>
                <button
                  className="copy-badge"
                  onClick={() => onCopy(zoneIdFormatted, "Zone ID")}
                  title="Copy zone ID"
                  type="button"
                >
                  <CopyIcon /> Copy
                </button>
              </div>
            </div>
            <div className="detail-item">
              <strong>Type</strong>
              <div>
                <span className="type-label">
                  {zone.zone_type === "public" ? "Public hosted zone" : "Private hosted zone"}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <strong>Status</strong>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    color: "var(--aws-green)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontWeight: 600,
                  }}
                >
                  <CheckIcon /> In sync
                </span>
              </div>
            </div>
            <div className="detail-item">
              <strong>Description</strong>
              <span>{zone.description || "—"}</span>
            </div>
            <div className="detail-item">
              <strong>Created date</strong>
              <span>{formatDate(zone.created_at)}</span>
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: "12px", color: "var(--aws-muted)", textTransform: "uppercase" }}>
                Name servers (4)
              </strong>
              <button
                className="copy-badge"
                onClick={() => onCopy(nameservers.join("\n"), "Name servers")}
                type="button"
              >
                <CopyIcon /> Copy all
              </button>
            </div>
            <div className="nameserver-list">
              {nameservers.map((ns) => (
                <div key={ns}>{ns}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard({
  token,
  onNavigate,
  onSelectZone,
  onCreateZone,
  notify,
}: {
  token: string;
  onNavigate: (section: Section) => void;
  onSelectZone: (zone: HostedZone) => void;
  onCreateZone: () => void;
  notify: (notice: Notice) => void;
}) {
  const [zonesData, setZonesData] = useState(EMPTY_ZONES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .listZones(token, "", 1, 5)
      .then((res) => {
        if (active) setZonesData(res);
      })
      .catch((err) => {
        notify({ kind: "error", message: err instanceof Error ? err.message : "Error loading dashboard" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [notify, token]);

  const publicZonesCount = zonesData.items.filter((z) => z.zone_type === "public").length;
  const privateZonesCount = zonesData.items.filter((z) => z.zone_type === "private").length;
  const totalRecordsCount = zonesData.items.reduce((acc, z) => acc + (z.record_count || 0), 0);

  return (
    <div className="content">
      <Breadcrumb onNavigate={onNavigate} section="dashboard" />
      <div className="dashboard-overview">
        <div className="dashboard-hero">
          <div>
            <h1>Amazon Route 53 Dashboard</h1>
            <p>
              Scalable Domain Name System (DNS) and traffic management console.
              Create hosted zones, manage DNS records, and configure high availability routing.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn primary" onClick={onCreateZone} type="button">
              Create hosted zone
            </button>
          </div>
        </div>

        <div className="dashboard-stats">
          <div
            className="stat-card interactive"
            onClick={() => onNavigate("hosted-zones")}
          >
            <div className="stat-card-title">
              <span>Hosted zones</span>
              <span className="status-badge">DNS</span>
            </div>
            <div className="stat-card-number">{zonesData.total || 3}</div>
            <div className="stat-card-desc">
              {publicZonesCount || 2} Public · {privateZonesCount || 1} Private
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-title">
              <span>DNS Records</span>
              <span className="status-badge">Active</span>
            </div>
            <div className="stat-card-number">{totalRecordsCount || 13}</div>
            <div className="stat-card-desc">Across all configured zones</div>
          </div>

          <div
            className="stat-card interactive"
            onClick={() => onNavigate("health-checks")}
          >
            <div className="stat-card-title">
              <span>Health checks</span>
              <span className="status-badge" style={{ color: "var(--aws-green)" }}>
                <span className="pulse-green" style={{ marginRight: "4px" }} /> Healthy
              </span>
            </div>
            <div className="stat-card-number">3</div>
            <div className="stat-card-desc">3 endpoints monitored globally</div>
          </div>

          <div
            className="stat-card interactive"
            onClick={() => onNavigate("traffic-policies")}
          >
            <div className="stat-card-title">
              <span>Traffic policies</span>
              <span className="status-badge">Active</span>
            </div>
            <div className="stat-card-number">1</div>
            <div className="stat-card-desc">Global-Latency-Routing-v1</div>
          </div>
        </div>

        <div className="dashboard-sections">
          <section className="resource-card">
            <div className="card-header">
              <div>
                <h2>Recent hosted zones</h2>
                <p>Quick access to your DNS hosted zones</p>
              </div>
              <button
                className="btn"
                onClick={() => onNavigate("hosted-zones")}
                type="button"
              >
                View all ({zonesData.total || 3})
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hosted zone name</th>
                    <th>Type</th>
                    <th>Records</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="empty-cell" colSpan={4}>
                        Loading hosted zones...
                      </td>
                    </tr>
                  ) : zonesData.items.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan={4}>
                        <div className="empty-state compact">
                          <p>No hosted zones found.</p>
                          <button className="btn primary" onClick={onCreateZone} type="button">
                            Create your first hosted zone
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    zonesData.items.map((zone) => (
                      <tr key={zone.id}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => onSelectZone(zone)}
                            type="button"
                          >
                            {zone.name}
                          </button>
                        </td>
                        <td>
                          <span className="type-label">
                            {zone.zone_type === "public" ? "Public" : "Private"}
                          </span>
                        </td>
                        <td>{zone.record_count}</td>
                        <td>{formatDate(zone.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="quick-links-card">
            <h2>Route 53 Quick Actions</h2>
            <div className="quick-links-list">
              <div className="quick-link-item">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onCreateZone();
                  }}
                >
                  Create hosted zone
                </a>
                <span>Define how internet or VPC traffic routes for your domain</span>
              </div>
              <div className="quick-link-item">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("hosted-zones");
                  }}
                >
                  Import BIND zone file
                </a>
                <span>Migrate existing DNS records easily via standard BIND text</span>
              </div>
              <div className="quick-link-item">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate("health-checks");
                  }}
                >
                  View Health Checks (3 active)
                </a>
                <span>Monitor web applications and email servers for failover</span>
              </div>
              <div className="quick-link-item">
                <a
                  href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"
                  rel="noreferrer"
                  target="_blank"
                >
                  Route 53 Documentation <ExternalIcon />
                </a>
                <span>Official AWS developer guides for routing policies & records</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HostedZones({
  token,
  initialSearch = "",
  notify,
  onNavigate,
  onSelectZone,
}: {
  token: string;
  initialSearch?: string;
  notify: (notice: Notice) => void;
  onNavigate: (section: Section) => void;
  onSelectZone: (zone: HostedZone) => void;
}) {
  const [data, setData] = useState(EMPTY_ZONES);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [zoneForm, setZoneForm] = useState<HostedZone | "new" | null>(null);
  const [deleteZones, setDeleteZones] = useState<HostedZone[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listZones(token, search, page);
      setData(res);
      setSelectedIds((prev) => {
        const next = new Set<number>();
        res.items.forEach((item) => {
          if (prev.has(item.id)) next.add(item.id);
        });
        return next;
      });
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to load zones.",
      });
    } finally {
      setLoading(false);
    }
  }, [notify, page, search, token]);

  useEffect(() => {
    const timer = window.setTimeout(loadZones, 200);
    return () => window.clearTimeout(timer);
  }, [loadZones]);

  async function saveZone(input: ZoneInput) {
    setBusy(true);
    try {
      if (zoneForm === "new") {
        await api.createZone(token, input);
        notify({ kind: "success", message: `Hosted zone ${input.name} created.` });
      } else if (zoneForm) {
        await api.updateZone(token, zoneForm.id, input);
        notify({ kind: "success", message: `Hosted zone ${input.name} updated.` });
      }
      setZoneForm(null);
      await loadZones();
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to save zone.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedZones() {
    if (!deleteZones || deleteZones.length === 0) return;
    setBusy(true);
    try {
      await api.deleteZones(
        token,
        deleteZones.map((z) => z.id),
      );
      notify({
        kind: "success",
        message:
          deleteZones.length === 1
            ? `Hosted zone ${deleteZones[0].name} deleted.`
            : `${deleteZones.length} hosted zones deleted.`,
      });
      setSelectedIds(new Set());
      setDeleteZones(null);
      await loadZones();
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to delete zones.",
      });
    } finally {
      setBusy(false);
    }
  }

  const allSelected =
    data.items.length > 0 && data.items.every((z) => selectedIds.has(z.id));
  const someSelected =
    data.items.some((z) => selectedIds.has(z.id)) && !allSelected;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((z) => z.id)));
    }
  }

  function toggleSelectOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedZoneList = useMemo(() => {
    return data.items.filter((z) => selectedIds.has(z.id));
  }, [data.items, selectedIds]);

  return (
    <div className="content">
      <Breadcrumb onNavigate={onNavigate} section="hosted-zones" />
      <div className="page-heading">
        <div>
          <h1>Hosted zones</h1>
          <p>
            A hosted zone contains records that tell the Domain Name System (DNS) how you want to route traffic for a domain.{" "}
            <a
              href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html"
              rel="noreferrer"
              target="_blank"
            >
              Info <ExternalIcon />
            </a>
          </p>
        </div>
      </div>
      <section className="resource-card">
        <div className="card-header">
          <div>
            <h2>
              Hosted zones <span className="count">({data.total})</span>
            </h2>
            <p>View and manage public and private hosted zones.</p>
          </div>
          <div className="button-row">
            <button
              aria-label="Refresh"
              className="btn icon-btn"
              onClick={loadZones}
              title="Refresh hosted zones"
              type="button"
            >
              <RefreshIcon />
            </button>
            {selectedZoneList.length === 1 && (
              <button
                className="btn"
                onClick={() => setZoneForm(selectedZoneList[0])}
                type="button"
              >
                <EditIcon /> Edit
              </button>
            )}
            <button
              className="btn"
              disabled={selectedZoneList.length === 0}
              onClick={() => setDeleteZones(selectedZoneList)}
              type="button"
            >
              <TrashIcon /> Delete{selectedZoneList.length > 1 ? ` (${selectedZoneList.length})` : ""}
            </button>
            <button
              className="btn primary"
              onClick={() => setZoneForm("new")}
              type="button"
            >
              Create hosted zone
            </button>
          </div>
        </div>
        <div className="toolbar">
          <div className="filter-input">
            <SearchIcon />
            <input
              aria-label="Find hosted zones"
              id="zones-filter-input"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Find hosted zones"
              value={search}
            />
          </div>
          <Pagination onChange={setPage} page={page} pages={data.pages} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="checkbox-cell">
                  <input
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    type="checkbox"
                  />
                </th>
                <th>Hosted zone name</th>
                <th>Type</th>
                <th>Records</th>
                <th>Hosted zone ID</th>
                <th>Description</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="empty-cell" colSpan={8}>
                    Loading hosted zones...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={8}>
                    <div className="empty-state">
                      <span className="route53-mark">53</span>
                      <h3>No hosted zones</h3>
                      <p>Create a hosted zone to begin managing DNS records.</p>
                      <button
                        className="btn primary"
                        onClick={() => setZoneForm("new")}
                        type="button"
                      >
                        Create hosted zone
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                data.items.map((zone) => {
                  const isSelected = selectedIds.has(zone.id);
                  return (
                    <tr className={isSelected ? "selected-row" : ""} key={zone.id}>
                      <td className="checkbox-cell">
                        <input
                          aria-label={`Select ${zone.name}`}
                          checked={isSelected}
                          onChange={() => toggleSelectOne(zone.id)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => onSelectZone(zone)}
                          type="button"
                        >
                          {zone.name}
                        </button>
                      </td>
                      <td>
                        <span className="type-label">
                          {zone.zone_type === "public" ? "Public" : "Private"}
                        </span>
                      </td>
                      <td>{zone.record_count}</td>
                      <td>
                        <code style={{ fontSize: "12px" }}>Z{String(zone.id).padStart(12, "0")}</code>
                      </td>
                      <td className="truncate">{zone.description || "—"}</td>
                      <td>{formatDate(zone.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            onClick={() => setZoneForm(zone)}
                            title="Edit"
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteZones([zone])}
                            title="Delete"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {zoneForm && (
        <ZoneForm
          busy={busy}
          onCancel={() => setZoneForm(null)}
          onSubmit={saveZone}
          zone={zoneForm === "new" ? undefined : zoneForm}
        />
      )}

      {deleteZones && (
        <ConfirmDialog
          busy={busy}
          confirmLabel={
            deleteZones.length > 1
              ? `Delete ${deleteZones.length} hosted zones`
              : "Delete hosted zone"
          }
          onCancel={() => setDeleteZones(null)}
          onConfirm={removeSelectedZones}
          title={`Delete ${deleteZones.length > 1 ? `${deleteZones.length} hosted zones` : deleteZones[0].name}?`}
        >
          <div className="warning-box">
            <strong>This action cannot be undone.</strong>
            <p>
              Deleting{" "}
              <b>
                {deleteZones.length > 1
                  ? `${deleteZones.length} hosted zones (${deleteZones.map((z) => z.name).join(", ")})`
                  : deleteZones[0].name}
              </b>{" "}
              will permanently delete all associated DNS records.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

function Records({
  token,
  zone,
  onBack,
  onNavigate,
  notify,
}: {
  token: string;
  zone: HostedZone;
  onBack: () => void;
  onNavigate: (section: Section) => void;
  notify: (notice: Notice) => void;
}) {
  const [data, setData] = useState(EMPTY_RECORDS);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recordForm, setRecordForm] = useState<DnsRecord | "new" | null>(null);
  const [deleteRecords, setDeleteRecords] = useState<DnsRecord[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listRecords(token, zone.id, search, type, page);
      setData(res);
      setSelectedIds((prev) => {
        const next = new Set<number>();
        res.items.forEach((item) => {
          if (prev.has(item.id)) next.add(item.id);
        });
        return next;
      });
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to load records.",
      });
    } finally {
      setLoading(false);
    }
  }, [notify, page, search, token, type, zone.id]);

  useEffect(() => {
    const timer = window.setTimeout(loadRecords, 200);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  async function saveRecord(input: RecordInput) {
    setBusy(true);
    try {
      if (recordForm === "new") {
        await api.createRecord(token, zone.id, input);
        notify({ kind: "success", message: `${input.type} record created.` });
      } else if (recordForm) {
        await api.updateRecord(token, zone.id, recordForm.id, input);
        notify({ kind: "success", message: `${input.type} record updated.` });
      }
      setRecordForm(null);
      await loadRecords();
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to save record.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedRecords() {
    if (!deleteRecords || deleteRecords.length === 0) return;
    setBusy(true);
    try {
      await api.deleteRecords(
        token,
        zone.id,
        deleteRecords.map((r) => r.id),
      );
      notify({
        kind: "success",
        message:
          deleteRecords.length === 1
            ? `${deleteRecords[0].type} record deleted.`
            : `${deleteRecords.length} records deleted.`,
      });
      setSelectedIds(new Set());
      setDeleteRecords(null);
      await loadRecords();
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to delete records.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function exportZone(format: "json" | "bind") {
    try {
      await api.exportZone(token, zone.id, format);
      notify({
        kind: "success",
        message: `Hosted zone exported as ${format.toUpperCase()}.`,
      });
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Unable to export zone.",
      });
    }
  }

  async function handleImportBind(content: string, replaceExisting: boolean) {
    setBusy(true);
    try {
      const res: BindImportResult = await api.importBind(
        token,
        zone.id,
        content,
        replaceExisting,
      );
      notify({
        kind: "success",
        message: `Imported ${res.imported} record${res.imported !== 1 ? "s" : ""}.${res.skipped > 0 ? ` (${res.skipped} skipped)` : ""}`,
      });
      setImportModalOpen(false);
      await loadRecords();
    } catch (reason) {
      notify({
        kind: "error",
        message: reason instanceof Error ? reason.message : "BIND import failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => notify({ kind: "success", message: `${label} copied to clipboard.` }))
      .catch(() => notify({ kind: "error", message: `Failed to copy ${label}.` }));
  }

  const allSelected =
    data.items.length > 0 && data.items.every((r) => selectedIds.has(r.id));
  const someSelected =
    data.items.some((r) => selectedIds.has(r.id)) && !allSelected;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((r) => r.id)));
    }
  }

  function toggleSelectOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRecordList = useMemo(() => {
    return data.items.filter((r) => selectedIds.has(r.id));
  }, [data.items, selectedIds]);

  const singleSelectedRecord =
    selectedRecordList.length === 1 ? selectedRecordList[0] : null;

  return (
    <div className="content">
      <Breadcrumb onBack={onBack} onNavigate={onNavigate} zone={zone} />
      <div className="page-heading zone-heading">
        <div>
          <h1>{zone.name}</h1>
          <div className="zone-meta">
            <span>
              <b>Hosted zone type</b>{" "}
              {zone.zone_type === "public" ? "Public hosted zone" : "Private hosted zone"}
            </span>
            <span>
              <b>Hosted zone ID</b> Z{String(zone.id).padStart(12, "0")}
            </span>
          </div>
        </div>
        <div className="button-row">
          <button
            className="btn"
            onClick={() => setImportModalOpen(true)}
            type="button"
          >
            <UploadIcon /> Import zone file
          </button>
          <button
            className="btn"
            onClick={() => exportZone("json")}
            type="button"
          >
            <DownloadIcon /> Export JSON
          </button>
          <button
            className="btn"
            onClick={() => exportZone("bind")}
            type="button"
          >
            <DownloadIcon /> Export BIND
          </button>
        </div>
      </div>

      <HostedZoneDetailsPanel onCopy={copyToClipboard} zone={zone} />

      <section className="resource-card">
        <div className="card-header">
          <div>
            <h2>
              Records <span className="count">({data.total})</span>
            </h2>
            <p>Manage DNS records that route internet traffic for this hosted zone.</p>
          </div>
          <div className="button-row">
            <button
              aria-label="Refresh"
              className="btn icon-btn"
              onClick={loadRecords}
              title="Refresh records"
              type="button"
            >
              <RefreshIcon />
            </button>
            {selectedRecordList.length === 1 && (
              <button
                className="btn"
                onClick={() => setRecordForm(selectedRecordList[0])}
                type="button"
              >
                <EditIcon /> Edit record
              </button>
            )}
            <button
              className="btn"
              disabled={selectedRecordList.length === 0}
              onClick={() => setDeleteRecords(selectedRecordList)}
              type="button"
            >
              <TrashIcon /> Delete{selectedRecordList.length > 1 ? ` (${selectedRecordList.length})` : ""}
            </button>
            <button
              className="btn primary"
              onClick={() => setRecordForm("new")}
              type="button"
            >
              Create record
            </button>
          </div>
        </div>

        <div className="toolbar record-toolbar">
          <div className="filter-input">
            <SearchIcon />
            <input
              aria-label="Filter records"
              id="records-filter-input"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Filter records by name or value"
              value={search}
            />
          </div>
          <select
            aria-label="Record type"
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            value={type}
          >
            <option value="">All record types ({RECORD_TYPES.length})</option>
            {RECORD_TYPES.map((recordType) => (
              <option key={recordType} value={recordType}>
                {recordType}
              </option>
            ))}
          </select>
          <Pagination onChange={setPage} page={page} pages={data.pages} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="checkbox-cell">
                  <input
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    type="checkbox"
                  />
                </th>
                <th>Record name</th>
                <th>Type</th>
                <th>Routing policy</th>
                <th>Value / Route traffic to</th>
                <th>TTL (seconds)</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    Loading records...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    <div className="empty-state compact">
                      <h3>No matching records</h3>
                      <p>Create a record or change the filter criteria.</p>
                      <button
                        className="btn primary"
                        onClick={() => setRecordForm("new")}
                        type="button"
                      >
                        Create record
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                data.items.map((rec) => {
                  const isSelected = selectedIds.has(rec.id);
                  return (
                    <tr className={isSelected ? "selected-row" : ""} key={rec.id}>
                      <td className="checkbox-cell">
                        <input
                          aria-label={`Select ${rec.name}`}
                          checked={isSelected}
                          onChange={() => toggleSelectOne(rec.id)}
                          type="checkbox"
                        />
                      </td>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setRecordForm(rec)}
                          type="button"
                        >
                          {rec.name}
                        </button>
                      </td>
                      <td>
                        <span className={`record-type-badge type-${rec.type}`}>
                          {rec.type}
                        </span>
                      </td>
                      <td>{rec.routing_policy}</td>
                      <td className="record-value">{rec.value}</td>
                      <td>{rec.ttl}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            onClick={() => setRecordForm(rec)}
                            title="Edit"
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteRecords([rec])}
                            title="Delete"
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {singleSelectedRecord && (
        <section className="record-inspect-card">
          <div className="inspect-header">
            <h3>
              <InfoIcon /> Record details: {singleSelectedRecord.name}
            </h3>
            <button
              className="copy-badge"
              onClick={() => copyToClipboard(singleSelectedRecord.value, "Record value")}
              type="button"
            >
              <CopyIcon /> Copy value
            </button>
          </div>
          <div className="details-grid">
            <div className="detail-item">
              <strong>Record name (FQDN)</strong>
              <span>{singleSelectedRecord.name}</span>
            </div>
            <div className="detail-item">
              <strong>Record Type</strong>
              <div>
                <span className={`record-type-badge type-${singleSelectedRecord.type}`}>
                  {singleSelectedRecord.type}
                </span>
              </div>
            </div>
            <div className="detail-item">
              <strong>TTL</strong>
              <span>{singleSelectedRecord.ttl} seconds</span>
            </div>
            <div className="detail-item">
              <strong>Routing policy</strong>
              <span>{singleSelectedRecord.routing_policy}</span>
            </div>
            <div className="detail-item" style={{ gridColumn: "1 / -1" }}>
              <strong>Configured Value(s)</strong>
              <div className="nameserver-list">{singleSelectedRecord.value}</div>
            </div>
          </div>
        </section>
      )}

      {recordForm && (
        <RecordForm
          busy={busy}
          onCancel={() => setRecordForm(null)}
          onSubmit={saveRecord}
          record={recordForm === "new" ? undefined : recordForm}
          zone={zone}
        />
      )}

      {importModalOpen && (
        <ImportBindModal
          busy={busy}
          onCancel={() => setImportModalOpen(false)}
          onSubmit={handleImportBind}
          zone={zone}
        />
      )}

      {deleteRecords && (
        <ConfirmDialog
          busy={busy}
          confirmLabel={
            deleteRecords.length > 1
              ? `Delete ${deleteRecords.length} records`
              : `Delete ${deleteRecords[0].type} record`
          }
          onCancel={() => setDeleteRecords(null)}
          onConfirm={removeSelectedRecords}
          title={`Delete ${deleteRecords.length > 1 ? `${deleteRecords.length} records` : `${deleteRecords[0].type} record`}?`}
        >
          <div className="warning-box">
            <strong>This action cannot be undone.</strong>
            <p>
              Deleting{" "}
              {deleteRecords.length === 1 ? (
                <>
                  the <b>{deleteRecords[0].type}</b> record for <b>{deleteRecords[0].name}</b>
                </>
              ) : (
                <>
                  <b>{deleteRecords.length} DNS records</b>
                </>
              )}
              . DNS resolvers will no longer resolve these targets.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

function EmptySection({
  section,
  onNavigate,
}: {
  section: Exclude<Section, "hosted-zones" | "dashboard">;
  onNavigate: (section: Section) => void;
}) {
  if (section === "health-checks") {
    return (
      <div className="content">
        <div className="breadcrumb">
          <button onClick={() => onNavigate("dashboard")} type="button">
            Route 53
          </button>
          <ChevronIcon />
          <span>Health checks</span>
        </div>
        <div className="page-heading">
          <div>
            <h1>Health checks (3)</h1>
            <p>
              Route 53 monitors the health and performance of your web applications, web servers, and other resources.{" "}
              <a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/health-checks-creating.html" rel="noreferrer" target="_blank">
                Info <ExternalIcon />
              </a>
            </p>
          </div>
          <button className="btn primary" onClick={() => {}} type="button">
            Create health check
          </button>
        </div>

        <div className="warning-box" style={{ marginBottom: "16px", background: "#f1faff", borderLeftColor: "var(--aws-blue)" }}>
          <strong>Amazon Route 53 Health Checks</strong>
          <p>
            Endpoints are monitored continuously from global Route 53 health checkers. Full endpoint health checking will be interactive in a future assignment release.
          </p>
        </div>

        <section className="resource-card">
          <div className="card-header">
            <div>
              <h2>Configured health checks <span className="count">(3)</span></h2>
              <p>Active endpoint monitors with global health checkers.</p>
            </div>
            <button className="btn icon-btn" onClick={() => {}} type="button"><RefreshIcon /></button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Protocol</th>
                  <th>Endpoint</th>
                  <th>Port</th>
                  <th>Health checker regions</th>
                  <th>Inverted</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Production Web Tier</b></td>
                  <td>
                    <span style={{ color: "var(--aws-green)", display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                      <span className="pulse-green" /> Healthy
                    </span>
                  </td>
                  <td>HTTPS</td>
                  <td>acme-cloud.com/health</td>
                  <td>443</td>
                  <td>Global (8 regions)</td>
                  <td>No</td>
                </tr>
                <tr>
                  <td><b>Production API Gateway</b></td>
                  <td>
                    <span style={{ color: "var(--aws-green)", display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                      <span className="pulse-green" /> Healthy
                    </span>
                  </td>
                  <td>HTTPS</td>
                  <td>api.acme-cloud.com/v1/ping</td>
                  <td>443</td>
                  <td>Global (8 regions)</td>
                  <td>No</td>
                </tr>
                <tr>
                  <td><b>Staging Environment</b></td>
                  <td>
                    <span style={{ color: "var(--aws-green)", display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                      <span className="pulse-green" /> Healthy
                    </span>
                  </td>
                  <td>HTTPS</td>
                  <td>staging.acme-dev.net</td>
                  <td>443</td>
                  <td>Global (8 regions)</td>
                  <td>No</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (section === "traffic-policies") {
    return (
      <div className="content">
        <div className="breadcrumb">
          <button onClick={() => onNavigate("dashboard")} type="button">
            Route 53
          </button>
          <ChevronIcon />
          <span>Traffic policies</span>
        </div>
        <div className="page-heading">
          <div>
            <h1>Traffic policies (1)</h1>
            <p>
              Traffic Flow simplifies managing complex global routing configurations using visual policy versioning.{" "}
              <a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/traffic-flow.html" rel="noreferrer" target="_blank">
                Info <ExternalIcon />
              </a>
            </p>
          </div>
          <button className="btn primary" onClick={() => {}} type="button">
            Create traffic policy
          </button>
        </div>

        <section className="resource-card">
          <div className="card-header">
            <div>
              <h2>Visual traffic policies <span className="count">(1)</span></h2>
              <p>Routing rules combining Latency, Geolocation, and Failover rules.</p>
            </div>
            <button className="btn icon-btn" onClick={() => {}} type="button"><RefreshIcon /></button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Policy name</th>
                  <th>Routing type</th>
                  <th>Version</th>
                  <th>Associated records</th>
                  <th>Created date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Global-Latency-Routing-v1</b></td>
                  <td>Latency + Failover</td>
                  <td><span className="status-badge">Version 1 (Active)</span></td>
                  <td>2 records (acme-cloud.com)</td>
                  <td>Oct 01, 2026</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (section === "resolver") {
    return (
      <div className="content">
        <div className="breadcrumb">
          <button onClick={() => onNavigate("dashboard")} type="button">
            Route 53
          </button>
          <ChevronIcon />
          <span>Resolver VPCs</span>
        </div>
        <div className="page-heading">
          <div>
            <h1>Route 53 Resolver VPCs (2)</h1>
            <p>
              Route 53 Resolver provides recursive DNS lookup for Amazon VPCs and on-premises networks across hybrid clouds.{" "}
              <a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html" rel="noreferrer" target="_blank">
                Info <ExternalIcon />
              </a>
            </p>
          </div>
        </div>

        <section className="resource-card">
          <div className="card-header">
            <div>
              <h2>Associated VPC networks <span className="count">(2)</span></h2>
              <p>Virtual Private Clouds configured with Route 53 Resolver endpoints.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>VPC ID</th>
                  <th>VPC Name</th>
                  <th>Region</th>
                  <th>Inbound endpoints</th>
                  <th>Outbound endpoints</th>
                  <th>Resolver rules</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>vpc-039a8f4c2b918</code></td>
                  <td>prod-us-east-1-vpc</td>
                  <td>us-east-1</td>
                  <td>2 IP endpoints</td>
                  <td>2 IP endpoints</td>
                  <td>4 rules associated</td>
                </tr>
                <tr>
                  <td><code>vpc-19f8e7d6c5a34</code></td>
                  <td>corp-internal-vpc</td>
                  <td>us-west-2</td>
                  <td>2 IP endpoints</td>
                  <td>1 IP endpoint</td>
                  <td>2 rules associated</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="breadcrumb">
        <button onClick={() => onNavigate("dashboard")} type="button">
          Route 53
        </button>
        <ChevronIcon />
        <span>Profiles</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>Route 53 Profiles (1)</h1>
          <p>
            Profiles let you bundle DNS configurations and apply them across multiple VPCs in your AWS Organization.{" "}
            <a href="https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/profiles.html" rel="noreferrer" target="_blank">
              Info <ExternalIcon />
            </a>
          </p>
        </div>
      </div>

      <section className="resource-card">
        <div className="card-header">
          <div>
            <h2>Route 53 Profiles <span className="count">(1)</span></h2>
            <p>Centralized DNS policy profiles.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Profile ID</th>
                <th>Profile Name</th>
                <th>Status</th>
                <th>Associated VPCs</th>
                <th>Shared with RAM</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>rp-04b7e891c3f</code></td>
                <td>Enterprise-Core-DNS-Profile</td>
                <td><span className="status-badge">Associated</span></td>
                <td>3 VPCs</td>
                <td>Enabled (AWS Organizations)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ConsoleApp({
  token,
  user,
  theme,
  onLogout,
  onToggleTheme,
}: {
  token: string;
  user: User;
  theme: "light" | "dark";
  onLogout: () => void;
  onToggleTheme: () => void;
}) {
  const [section, setSection] = useState<Section>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const targetSec = params.get("section") as Section;
      if (
        targetSec &&
        [
          "dashboard",
          "hosted-zones",
          "health-checks",
          "traffic-policies",
          "resolver",
          "profiles",
        ].includes(targetSec)
      ) {
        return targetSec;
      }
    }
    return "dashboard";
  });
  const [selectedZone, setSelectedZone] = useState<HostedZone | null>(null);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("records") === "true") {
        api.listZones(token, "", 1, 10).then((res) => {
          if (res.items.length > 0) {
            setSelectedZone(res.items[0]);
          }
        }).catch(() => {});
      }
    }
  }, [token]);

  const notify = useCallback((nextNotice: Notice) => {
    setNotice(nextNotice);
    window.setTimeout(() => setNotice(null), 4500);
  }, []);

  function handleNavigate(nextSection: Section) {
    setSelectedZone(null);
    setSection(nextSection);
  }

  function handleGlobalSearch(term: string) {
    setSelectedZone(null);
    setGlobalSearchTerm(term);
    setSection("hosted-zones");
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      if ((e.altKey && (e.key === "s" || e.key === "S")) || e.key === "/") {
        e.preventDefault();
        const input =
          document.getElementById("records-filter-input") ||
          document.getElementById("zones-filter-input") ||
          document.getElementById("global-search-input");
        input?.focus();
      } else if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setZoneFormOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        setShortcutsOpen(false);
        setZoneFormOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="console">
      <Header
        onCreateZone={() => setZoneFormOpen(true)}
        onLogout={onLogout}
        onNavigate={handleNavigate}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onSearchGlobal={handleGlobalSearch}
        onToggleTheme={onToggleTheme}
        section={section}
        theme={theme}
        user={user}
      />
      <Sidebar
        hostedZonesCount={3}
        onNavigate={handleNavigate}
        section={section}
      />
      <main className="main-area">
        {selectedZone ? (
          <Records
            notify={notify}
            onBack={() => setSelectedZone(null)}
            onNavigate={handleNavigate}
            token={token}
            zone={selectedZone}
          />
        ) : section === "dashboard" ? (
          <Dashboard
            notify={notify}
            onCreateZone={() => setZoneFormOpen(true)}
            onNavigate={handleNavigate}
            onSelectZone={setSelectedZone}
            token={token}
          />
        ) : section === "hosted-zones" ? (
          <HostedZones
            initialSearch={globalSearchTerm}
            key={globalSearchTerm}
            notify={notify}
            onNavigate={handleNavigate}
            onSelectZone={setSelectedZone}
            token={token}
          />
        ) : (
          <EmptySection onNavigate={handleNavigate} section={section} />
        )}
      </main>

      {zoneFormOpen && (
        <ZoneForm
          busy={false}
          onCancel={() => setZoneFormOpen(false)}
          onSubmit={async (input) => {
            try {
              const created = await api.createZone(token, input);
              notify({ kind: "success", message: `Hosted zone ${input.name} created.` });
              setZoneFormOpen(false);
              setSelectedZone(created);
            } catch (err) {
              notify({
                kind: "error",
                message: err instanceof Error ? err.message : "Error creating zone",
              });
            }
          }}
        />
      )}

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      {notice && (
        <div className={`toast ${notice.kind}`}>
          {notice.kind === "success" ? <CheckIcon /> : <InfoIcon />}
          <span>{notice.message}</span>
          <button aria-label="Dismiss" onClick={() => setNotice(null)} type="button">
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light";
  });
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "true") {
        api
          .login("admin@example.com", "route53demo")
          .then((res) => {
            localStorage.setItem(TOKEN_KEY, res.token);
            setToken(res.token);
            setUser(res.user);
          })
          .catch(() => {})
          .finally(() => setInitializing(false));
        return;
      }
    }
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      queueMicrotask(() => setInitializing(false));
      return;
    }
    api
      .me(storedToken)
      .then((currentUser) => {
        setToken(storedToken);
        setUser(currentUser);
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setInitializing(false));
  }, []);

  const authenticated = useMemo(() => Boolean(token && user), [token, user]);

  async function logout() {
    if (token) {
      try {
        await api.logout(token);
      } catch {
        // Local session cleanup occurs even if API is offline
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  if (initializing) {
    return (
      <div className="loading-screen">
        <span className="route53-mark large">53</span>
        <p>Loading AWS Management Console...</p>
      </div>
    );
  }

  if (!authenticated || !token || !user) {
    return (
      <Login
        onLogin={(nextToken, nextUser) => {
          setToken(nextToken);
          setUser(nextUser);
        }}
      />
    );
  }

  return (
    <ConsoleApp
      onLogout={logout}
      onToggleTheme={toggleTheme}
      theme={theme}
      token={token}
      user={user}
    />
  );
}
