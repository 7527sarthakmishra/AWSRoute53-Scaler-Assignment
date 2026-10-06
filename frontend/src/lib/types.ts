export type User = {
  id: number;
  email: string;
  name: string;
};

export type HostedZone = {
  id: number;
  name: string;
  description: string | null;
  zone_type: "public" | "private";
  record_count: number;
  created_at: string;
  updated_at: string;
};

export type DnsRecord = {
  id: number;
  hosted_zone_id: number;
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
  routing_policy: string;
  set_identifier: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "TXT"
  | "MX"
  | "NS"
  | "PTR"
  | "SRV"
  | "CAA";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type ZoneInput = {
  name: string;
  description: string;
  zone_type: "public" | "private";
};

export type RecordInput = {
  name: string;
  type: RecordType;
  value: string;
  ttl: number;
  routing_policy: string;
  set_identifier: string | null;
};

export type BindImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

