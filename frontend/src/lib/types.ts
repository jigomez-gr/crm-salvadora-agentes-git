export type UserRole = "admin" | "service_manager" | "employee";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  // True while the user still owes a password change (admin reset / first login
  // on the default password). The app forces a change screen until they do.
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id?: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price?: string | null;
  calendarId?: string;
  managerId?: string | null;
  manager?: User | null;
  requiresApproval?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ContactStatus = "lead" | "active" | "inactive";

// Sales-funnel stage for the Kanban pipeline board (distinct from `status`).
export type PipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "won"
  | "lost";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  status: ContactStatus;
  tags: string[];
  source?: string | null;
  customFields?: Record<string, string> | null;
  // Pipeline (Kanban) — funnel stage + manual ordering within a column.
  pipelineStage?: PipelineStage;
  boardPosition?: number;
  // Consent / GDPR.
  optedOut: boolean;
  optedOutAt?: string | null;
  anonymizedAt?: string | null;
  createdAt: string;
}

// ─── Pipeline board (Kanban) ───
export interface BoardCard extends Contact {
  nextAppointment: { service: string; startsAt: string } | null;
}

export interface BoardColumn {
  stage: PipelineStage;
  total: number;
  items: BoardCard[];
}

export interface BoardData {
  stages: BoardColumn[];
}

// Lightweight per-stage counts for the dashboard mini-funnel (GET /api/contacts/board/summary).
export interface PipelineStageTotal {
  stage: PipelineStage;
  total: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

// Paginated contacts list (server-side: limit/offset + search/status filter).
export interface ContactPage {
  items: Contact[];
  total: number;
  limit: number;
  offset: number;
}

export interface ContactWithAppointments extends Contact {
  appointments: Appointment[];
}

export interface Appointment {
  id: string;
  contactId: string;
  contact?: Contact;
  service: string;
  serviceId?: string | null;
  calendarId?: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled" | "completed" | "pending_approval";
  notes?: string | null;
  // Optional list price (numeric → string), for revenue reporting.
  price?: string | null;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  cancellationReason?: string | null;
}

export interface DashboardMetrics {
  contactsCount: number;
  appointmentsToday: number;
  upcomingAppointments: number;
  activeAgents: number;
  agentsTotal: number;
  // Inbox signals — the two that mean "a human must act now".
  unreadConversations: number;
  handoffConversations: number;
  // Cold leads waiting on a first touch (pipelineStage = new).
  newLeads: number;
}

export interface WorkingHour {
  day: number; // 0=Sunday … 6=Saturday (matches backend AgentConfig entity)
  open: string;
  close: string;
}

export interface Agent {
  agentKey: string;
  businessName: string;
  businessDescription: string;
  // Owner-authored behaviour prompt (how the agent should act), layered on the
  // internal hardened prompt. Distinct from businessDescription (what the business is).
  customInstructions?: string | null;
  channel: string;
  services: Service[];
  workingHours: WorkingHour[];
  tone: string;
  timezone: string;
  model: string;
  whatsappNumber: string | null;
  enabled: boolean;
  // Appointment reminders (WhatsApp HSM template).
  remindersEnabled: boolean;
  reminderTemplateName: string | null;
  reminderTemplateLanguage: string;
  // Secrets are NEVER sent by the API. The browser only learns whether each one
  // is set; send a new value in these fields to change it, or leave blank to
  // keep the stored secret unchanged.
  openrouterApiKey?: string | null;
  ycloudApiKey?: string | null;
  ycloudWebhookSecret?: string | null;
  hasOpenrouterApiKey?: boolean;
  hasYcloudApiKey?: boolean;
  hasYcloudWebhookSecret?: boolean;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
  promptPrice: string | null;
  completionPrice: string | null;
}

export interface ModelsResponse {
  recommended: string[];
  models: OpenRouterModel[];
}

// ─── Agent knowledge base (documents) ───
export interface KnowledgeDocument {
  id: string;
  filename: string;
  fileExtension: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  createdAt: string;
}

export interface KnowledgeList {
  documents: KnowledgeDocument[];
  totalChars: number;
  budgetChars: number;
  // 'inject' = the whole base goes into every message; 'retrieve' = only the
  // most relevant fragments are searched per message.
  mode: "inject" | "retrieve";
}

export type MessageStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Conversation {
  threadId: string;
  channel: "whatsapp" | "playground";
  // Human handoff: the agent stops auto-replying on this thread.
  handoff: boolean;
  // Inbound messages the operator hasn't opened yet (inbox badge).
  unreadCount: number;
  contact?: { name: string; phone: string };
  lastMessage: {
    body: string;
    direction: "inbound" | "outbound";
    // Null for a conversation row created without any persisted message yet
    // (e.g. a handoff toggle on an empty thread) — always guard before parsing.
    createdAt: string | null;
  };
  // When the customer last wrote — outside 24h, WhatsApp free-text is blocked.
  lastInboundAt?: string | null;
}

// Paginated inbox list (server-side: limit/offset).
export interface ConversationPage {
  items: Conversation[];
  total: number;
  limit: number;
  offset: number;
}

export interface AppSettings {
  id: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBranding {
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
}

// ─── Email (SMTP) ───
export interface EmailConfig {
  fromName: string | null;
  fromAddress: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  // The password is never returned; the UI only learns whether one is stored.
  hasSmtpPassword: boolean;
}

export interface EmailStatus {
  configured: boolean;
  fromAddress: string | null;
}

export interface EmailMessage {
  id: string;
  contactId: string;
  toAddress: string;
  subject: string;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  sentByEmail: string | null;
  createdAt: string;
}

export interface VerticalPreset {
  key: string;
  label: string;
  businessName: string;
  businessDescription: string;
  tone: string;
  services: Service[];
  workingHours: WorkingHour[];
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Reports / analytics (GET /api/reports/summary) ───
export interface ServiceStat {
  service: string;
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
}

export interface SourceStat {
  source: string;
  total: number;
  converted: number;
}

export type FunnelKey =
  | "leads"
  | "contacted"
  | "qualified"
  | "booked"
  | "won";

export interface FunnelStep {
  key: FunnelKey;
  count: number;
}

export interface PipelineStageCounts {
  new: number;
  contacted: number;
  qualified: number;
  booked: number;
  won: number;
  lost: number;
}

export interface TrendPoint {
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
  good: boolean | null;
}

export interface ReportTrends {
  appointments: TrendPoint;
  completionRate: TrendPoint;
  cancellationRate: TrendPoint;
  newContacts: TrendPoint;
}

export interface ReportSummary {
  range: { from: string; to: string };
  appointments: {
    total: number;
    byStatus: { scheduled: number; completed: number; cancelled: number };
    completionRate: number; // 0–1
    cancellationRate: number; // 0–1
    byDay: {
      date: string;
      scheduled: number;
      completed: number;
      cancelled: number;
    }[];
    byHour: number[]; // 24 buckets
    byService: ServiceStat[];
    revenue: { total: number; byDay: { date: string; amount: number }[] };
  };
  contacts: {
    byStatus: { lead: number; active: number; inactive: number };
    total: number;
    conversionRate: number; // 0–1
    newByDay: { date: string; count: number }[];
    byPipelineStage: PipelineStageCounts;
    bySource: SourceStat[];
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    byDay: { date: string; inbound: number; outbound: number }[];
  };
  funnel: FunnelStep[];
  trends?: ReportTrends;
}

export type MediaType = "image" | "audio" | "video" | "document" | "sticker";

export interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status?: MessageStatus;
  // Inbound WhatsApp media. The bytes are fetched (authenticated) from
  // /api/conversations/media/:id — the server never returns the raw URL.
  mediaType?: MediaType | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
}
