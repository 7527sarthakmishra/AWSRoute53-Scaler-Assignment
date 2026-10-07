// In-memory data store for Next.js API route handlers

export interface UserEntity {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface ZoneEntity {
  id: number;
  name: string;
  comment: string | null;
  private_zone: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordEntity {
  id: number;
  zone_id: number;
  name: string;
  type: string;
  ttl: number;
  values: string[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_USER: UserEntity = {
  id: 1,
  email: "admin@example.com",
  name: "Sarthak Mishra (Admin)",
  is_active: true,
  created_at: new Date().toISOString(),
};

function initStore() {
  const now = new Date().toISOString();
  const zones: ZoneEntity[] = [
    {
      id: 1,
      name: "acme-cloud.com.",
      comment: "Production web applications and public API services",
      private_zone: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      name: "corp.internal.",
      comment: "Internal VPC private DNS service routing",
      private_zone: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      name: "staging.acme-dev.net.",
      comment: "Staging and pre-production environment",
      private_zone: false,
      created_at: now,
      updated_at: now,
    },
  ];

  const records: RecordEntity[] = [
    {
      id: 1,
      zone_id: 1,
      name: "acme-cloud.com.",
      type: "A",
      ttl: 300,
      values: ["198.51.100.10", "198.51.100.11"],
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      zone_id: 1,
      name: "www.acme-cloud.com.",
      type: "CNAME",
      ttl: 300,
      values: ["acme-cloud.com."],
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      zone_id: 1,
      name: "api.acme-cloud.com.",
      type: "A",
      ttl: 60,
      values: ["198.51.100.25"],
      created_at: now,
      updated_at: now,
    },
    {
      id: 4,
      zone_id: 1,
      name: "mail.acme-cloud.com.",
      type: "MX",
      ttl: 3600,
      values: ["10 mail1.acme-cloud.com.", "20 mail2.acme-cloud.com."],
      created_at: now,
      updated_at: now,
    },
    {
      id: 5,
      zone_id: 1,
      name: "acme-cloud.com.",
      type: "TXT",
      ttl: 300,
      values: ['"v=spf1 include:_spf.google.com ~all"'],
      created_at: now,
      updated_at: now,
    },
    {
      id: 6,
      zone_id: 1,
      name: "acme-cloud.com.",
      type: "CAA",
      ttl: 3600,
      values: ['0 issue "letsencrypt.org"'],
      created_at: now,
      updated_at: now,
    },
    {
      id: 7,
      zone_id: 1,
      name: "_sip._tcp.acme-cloud.com.",
      type: "SRV",
      ttl: 300,
      values: ["10 5 5060 sip.acme-cloud.com."],
      created_at: now,
      updated_at: now,
    },
    {
      id: 8,
      zone_id: 2,
      name: "gateway.corp.internal.",
      type: "A",
      ttl: 300,
      values: ["10.0.1.1"],
      created_at: now,
      updated_at: now,
    },
    {
      id: 9,
      zone_id: 2,
      name: "db-primary.corp.internal.",
      type: "A",
      ttl: 60,
      values: ["10.0.2.10"],
      created_at: now,
      updated_at: now,
    },
    {
      id: 10,
      zone_id: 2,
      name: "auth.corp.internal.",
      type: "CNAME",
      ttl: 300,
      values: ["gateway.corp.internal."],
      created_at: now,
      updated_at: now,
    },
    {
      id: 11,
      zone_id: 3,
      name: "staging.acme-dev.net.",
      type: "A",
      ttl: 300,
      values: ["203.0.113.40"],
      created_at: now,
      updated_at: now,
    },
    {
      id: 12,
      zone_id: 3,
      name: "web.staging.acme-dev.net.",
      type: "CNAME",
      ttl: 300,
      values: ["staging.acme-dev.net."],
      created_at: now,
      updated_at: now,
    },
    {
      id: 13,
      zone_id: 3,
      name: "staging.acme-dev.net.",
      type: "TXT",
      ttl: 300,
      values: ['"aws-route53-verification=d8f9214a"'],
      created_at: now,
      updated_at: now,
    },
  ];

  return {
    user: DEFAULT_USER,
    zones,
    records,
    nextZoneId: 4,
    nextRecordId: 14,
  };
}

// Global singleton across hot reloads in dev / serverless
const globalStore = globalThis as unknown as {
  __route53_store?: ReturnType<typeof initStore>;
};

if (!globalStore.__route53_store) {
  globalStore.__route53_store = initStore();
}

const store = globalStore.__route53_store;

export const serverDb = {
  getUser: () => store.user,

  listZones: (search = "", page = 1, pageSize = 10) => {
    let list = [...store.zones];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (z) =>
          z.name.toLowerCase().includes(q) ||
          (z.comment && z.comment.toLowerCase().includes(q)),
      );
    }
    const total = list.length;
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize).map((z) => ({
      ...z,
      record_count: store.records.filter((r) => r.zone_id === z.id).length,
    }));
    return {
      items: paged,
      total,
      page,
      page_size: pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  getZone: (id: number) => {
    const zone = store.zones.find((z) => z.id === id);
    if (!zone) return null;
    return {
      ...zone,
      record_count: store.records.filter((r) => r.zone_id === zone.id).length,
    };
  },

  createZone: (input: { name: string; comment?: string | null; private_zone?: boolean }) => {
    const formattedName = input.name.endsWith(".") ? input.name : `${input.name}.`;
    const now = new Date().toISOString();
    const newZone: ZoneEntity = {
      id: store.nextZoneId++,
      name: formattedName,
      comment: input.comment || null,
      private_zone: Boolean(input.private_zone),
      created_at: now,
      updated_at: now,
    };
    store.zones.unshift(newZone);
    return {
      ...newZone,
      record_count: 0,
    };
  },

  updateZone: (id: number, comment?: string | null) => {
    const zone = store.zones.find((z) => z.id === id);
    if (!zone) return null;
    zone.comment = comment || null;
    zone.updated_at = new Date().toISOString();
    return {
      ...zone,
      record_count: store.records.filter((r) => r.zone_id === zone.id).length,
    };
  },

  deleteZone: (id: number) => {
    const index = store.zones.findIndex((z) => z.id === id);
    if (index === -1) return false;
    store.zones.splice(index, 1);
    store.records = store.records.filter((r) => r.zone_id !== id);
    return true;
  },

  listRecords: (zoneId: number, search = "", type = "", page = 1, pageSize = 10) => {
    let list = store.records.filter((r) => r.zone_id === zoneId);
    if (type && type !== "all" && type !== "All record types (9)") {
      list = list.filter((r) => r.type.toUpperCase() === type.toUpperCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.values.some((v) => v.toLowerCase().includes(q)),
      );
    }
    const total = list.length;
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);
    return {
      items: paged,
      total,
      page,
      page_size: pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  createRecord: (
    zoneId: number,
    input: { name: string; type: string; ttl: number; values: string[] },
  ) => {
    const zone = store.zones.find((z) => z.id === zoneId);
    if (!zone) return null;
    const now = new Date().toISOString();
    const formattedName = input.name.endsWith(".") ? input.name : `${input.name}.`;
    const newRecord: RecordEntity = {
      id: store.nextRecordId++,
      zone_id: zoneId,
      name: formattedName,
      type: input.type.toUpperCase(),
      ttl: input.ttl || 300,
      values: input.values,
      created_at: now,
      updated_at: now,
    };
    store.records.unshift(newRecord);
    return newRecord;
  },

  updateRecord: (
    zoneId: number,
    recordId: number,
    input: { ttl?: number; values?: string[] },
  ) => {
    const record = store.records.find((r) => r.id === recordId && r.zone_id === zoneId);
    if (!record) return null;
    if (input.ttl !== undefined) record.ttl = input.ttl;
    if (input.values !== undefined) record.values = input.values;
    record.updated_at = new Date().toISOString();
    return record;
  },

  deleteRecord: (zoneId: number, recordId: number) => {
    const index = store.records.findIndex((r) => r.id === recordId && r.zone_id === zoneId);
    if (index === -1) return false;
    store.records.splice(index, 1);
    return true;
  },

  importBind: (zoneId: number, content: string, replaceExisting = false) => {
    const zone = store.zones.find((z) => z.id === zoneId);
    if (!zone) return { imported_count: 0, replaced: false, errors: ["Zone not found"] };

    if (replaceExisting) {
      store.records = store.records.filter((r) => r.zone_id !== zoneId);
    }

    const lines = content.split("\n");
    let imported = 0;
    const errors: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(";") || line.startsWith("$")) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const [name, ttlStr, type, ...valueParts] = parts;
        const ttl = parseInt(ttlStr, 10) || 300;
        const val = valueParts.join(" ");
        if (["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"].includes(type.toUpperCase())) {
          store.records.push({
            id: store.nextRecordId++,
            zone_id: zoneId,
            name: name.endsWith(".") ? name : `${name}.${zone.name}`,
            type: type.toUpperCase(),
            ttl,
            values: [val],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          imported++;
        }
      }
    }

    return { imported_count: imported, replaced: replaceExisting, errors };
  },
};
