import type {
  BindImportResult,
  DnsRecord,
  HostedZone,
  Paginated,
  RecordInput,
  User,
  ZoneInput,
} from "./types";

type ApiHostedZone = {
  id: number;
  name: string;
  comment: string | null;
  private_zone: boolean;
  record_count: number;
  created_at: string;
  updated_at: string;
};

type ApiDnsRecord = {
  id: number;
  zone_id: number;
  name: string;
  type: DnsRecord["type"];
  ttl: number;
  values: string[];
  created_at: string;
  updated_at: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "/api" : "http://localhost:8000/api");

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const body = (await response.json()) as {
        detail?: string | Array<{ msg: string }>;
      };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((item) => item.msg).join(", ");
      }
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function mapZone(zone: ApiHostedZone): HostedZone {
  return {
    id: zone.id,
    name: zone.name.replace(/\.$/, ""),
    description: zone.comment,
    zone_type: zone.private_zone ? "private" : "public",
    record_count: zone.record_count,
    created_at: zone.created_at,
    updated_at: zone.updated_at,
  };
}

function mapRecord(record: ApiDnsRecord): DnsRecord {
  return {
    id: record.id,
    hosted_zone_id: record.zone_id,
    name: record.name.replace(/\.$/, ""),
    type: record.type,
    value: record.values.join("\n"),
    ttl: record.ttl,
    routing_policy: "Simple",
    set_identifier: null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function mapPage<TInput, TOutput>(
  page: Paginated<TInput>,
  mapper: (item: TInput) => TOutput,
): Paginated<TOutput> {
  return { ...page, items: page.items.map(mapper) };
}

function zonePayload(input: ZoneInput) {
  return {
    name: input.name,
    comment: input.description || null,
    private_zone: input.zone_type === "private",
  };
}

function recordPayload(input: RecordInput) {
  return {
    name: input.name,
    type: input.type,
    ttl: input.ttl,
    values: input.value
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) =>
    request<User>("/auth/me", { headers: authHeaders(token) }),

  logout: (token: string) =>
    request<void>("/auth/logout", {
      method: "POST",
      headers: authHeaders(token),
    }),

  listZones: async (
    token: string,
    search: string,
    page: number,
    pageSize = 10,
  ) =>
    mapPage(
      await request<Paginated<ApiHostedZone>>(
        `/hosted-zones?search=${encodeURIComponent(search)}&page=${page}&page_size=${pageSize}`,
        { headers: authHeaders(token) },
      ),
      mapZone,
    ),

  createZone: async (token: string, input: ZoneInput) =>
    mapZone(
      await request<ApiHostedZone>("/hosted-zones", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(zonePayload(input)),
      }),
    ),

  updateZone: async (token: string, id: number, input: ZoneInput) =>
    mapZone(
      await request<ApiHostedZone>(`/hosted-zones/${id}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(zonePayload(input)),
      }),
    ),

  deleteZone: (token: string, id: number) =>
    request<void>(`/hosted-zones/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),

  listRecords: async (
    token: string,
    zoneId: number,
    search: string,
    type: string,
    page: number,
    pageSize = 10,
  ) =>
    mapPage(
      await request<Paginated<ApiDnsRecord>>(
        `/hosted-zones/${zoneId}/records?search=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}&page=${page}&page_size=${pageSize}`,
        { headers: authHeaders(token) },
      ),
      mapRecord,
    ),

  createRecord: async (token: string, zoneId: number, input: RecordInput) =>
    mapRecord(
      await request<ApiDnsRecord>(`/hosted-zones/${zoneId}/records`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(recordPayload(input)),
      }),
    ),

  updateRecord: async (
    token: string,
    zoneId: number,
    recordId: number,
    input: RecordInput,
  ) =>
    mapRecord(
      await request<ApiDnsRecord>(
        `/hosted-zones/${zoneId}/records/${recordId}`,
        {
          method: "PUT",
          headers: authHeaders(token),
          body: JSON.stringify(recordPayload(input)),
        },
      ),
    ),

  deleteRecord: (token: string, zoneId: number, recordId: number) =>
    request<void>(`/hosted-zones/${zoneId}/records/${recordId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),

  deleteZones: async (token: string, ids: number[]) => {
    await Promise.all(ids.map((id) => api.deleteZone(token, id)));
  },

  deleteRecords: async (token: string, zoneId: number, recordIds: number[]) => {
    await Promise.all(
      recordIds.map((recordId) => api.deleteRecord(token, zoneId, recordId)),
    );
  },

  importBind: (
    token: string,
    zoneId: number,
    content: string,
    replaceExisting = false,
  ) =>
    request<BindImportResult>(`/hosted-zones/${zoneId}/import/bind`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ content, replace_existing: replaceExisting }),
    }),

  exportZone: async (
    token: string,
    zoneId: number,
    format: "json" | "bind",
  ) => {
    const response = await fetch(
      `${API_URL}/hosted-zones/${zoneId}/export/${format}`,
      { headers: authHeaders(token) },
    );
    if (!response.ok) {
      throw new ApiError("Unable to export hosted zone.", response.status);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hosted-zone-${zoneId}.${format === "json" ? "json" : "zone"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export { ApiError };
