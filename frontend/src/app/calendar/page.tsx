"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
  isToday,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { apiFetch, ApiError } from "@/lib/api";
import { Appointment, Contact, ContactPage, Service } from "@/lib/types";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Appointment["status"], string> = {
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-200",
  pending_approval: "bg-amber-100 text-amber-800 border-amber-300",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

function statusVariant(s: Appointment["status"]) {
  if (s === "scheduled") return "info";
  if (s === "pending_approval") return "warning";
  if (s === "completed") return "success";
  return "danger";
}

function statusLabel(s: Appointment["status"]) {
  if (s === "scheduled") return "Programada";
  if (s === "pending_approval") return "Pendiente";
  if (s === "completed") return "Completada";
  return "Cancelada";
}

// ─── Create/Edit Modal ───────────────────────────────────────────────────────

interface ApptFormData {
  contactId: string;
  service: string;
  serviceId?: string;
  calendarId?: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
  price: string;
}

function AppointmentModal({
  open,
  onClose,
  initial,
  contacts,
  services,
  defaultStart,
  onSave,
  onAccept,
  onReject,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Appointment;
  contacts: Contact[];
  services: Service[];
  defaultStart?: Date;
  onSave: (data: ApptFormData) => Promise<void>;
  onAccept?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
}) {
  const toLocal = (iso: string) =>
    iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : "";

  const defaultStartStr = defaultStart
    ? format(defaultStart, "yyyy-MM-dd'T'HH:mm")
    : "";
  const defaultEndStr = defaultStart
    ? format(
        new Date(defaultStart.getTime() + 60 * 60 * 1000),
        "yyyy-MM-dd'T'HH:mm"
      )
    : "";

  const [form, setForm] = useState<ApptFormData>({
    contactId: initial?.contactId ?? "",
    service: initial?.service ?? "",
    serviceId: initial?.serviceId ?? "",
    calendarId: initial?.calendarId ?? "default",
    startsAt: initial ? toLocal(initial.startsAt) : defaultStartStr,
    endsAt: initial ? toLocal(initial.endsAt) : defaultEndStr,
    status: initial?.status ?? "scheduled",
    price: initial?.price ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedService = services.find(
    (s) => s.id === form.serviceId || s.name === form.service
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId || !form.service || !form.startsAt || !form.endsAt) {
      setError("Todos los campos obligatorios deben estar rellenos.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo guardar la cita.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Detalles / Editar Cita" : "Nueva Cita"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Contacto <span className="text-red-500">*</span>
          </label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={form.contactId}
            onChange={(e) =>
              setForm((f) => ({ ...f, contactId: e.target.value }))
            }
          >
            <option value="">Selecciona un contacto…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Servicio <span className="text-red-500">*</span>
          </label>
          {services.length > 0 ? (
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={form.serviceId || ""}
              onChange={(e) => {
                const sid = e.target.value;
                const s = services.find((srv) => srv.id === sid);
                if (s) {
                  const start = form.startsAt ? new Date(form.startsAt) : new Date();
                  const end = new Date(start.getTime() + s.durationMinutes * 60000);
                  setForm((f) => ({
                    ...f,
                    serviceId: s.id,
                    service: s.name,
                    calendarId: s.calendarId,
                    price: s.price ?? f.price,
                    endsAt: format(end, "yyyy-MM-dd'T'HH:mm"),
                    status: s.requiresApproval ? "pending_approval" : (f.status === "pending_approval" ? "scheduled" : f.status),
                  }));
                } else {
                  setForm((f) => ({ ...f, serviceId: "", service: "" }));
                }
              }}
            >
              <option value="">Selecciona un servicio…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min{s.price ? ` · ${s.price}€` : ""})
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={form.service}
              onChange={(e) =>
                setForm((f) => ({ ...f, service: e.target.value }))
              }
              placeholder="ej. Clase de Yoga"
            />
          )}

          {selectedService && (
            <div className="mt-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-600 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-medium text-neutral-700">Responsable de servicio:</span>
                <span className="font-semibold text-indigo-700">{selectedService.manager?.name || "Sin asignar"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium text-neutral-700">Calendario asignado:</span>
                <span className="font-mono text-[11px] bg-neutral-200 px-1.5 py-0.5 rounded text-neutral-800">{selectedService.calendarId}</span>
              </div>
              {selectedService.requiresApproval && (
                <div className="mt-1 flex items-center gap-1 font-medium text-amber-700">
                  <span>⚠️ Requiere aprobación del responsable de servicio</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Inicio <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => {
                const newStartStr = e.target.value;
                const newStart = new Date(newStartStr);
                const dur = selectedService?.durationMinutes ?? 60;
                const newEnd = new Date(newStart.getTime() + dur * 60000);
                setForm((f) => ({
                  ...f,
                  startsAt: newStartStr,
                  endsAt: !isNaN(newEnd.getTime()) ? format(newEnd, "yyyy-MM-dd'T'HH:mm") : f.endsAt,
                }));
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Fin <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) =>
                setForm((f) => ({ ...f, endsAt: e.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Precio <span className="text-neutral-400">(€)</span>
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="ej. 35"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Estado de la Cita
          </label>
          <select
            className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                status: e.target.value as Appointment["status"],
              }))
            }
          >
            <option value="scheduled">Programada (Confirmada)</option>
            <option value="pending_approval">Pendiente de aprobación</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>

        {initial?.status === "pending_approval" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
            <div>
              <span className="font-semibold block">Cita pendiente de validación</span>
              <span>Esta cita está a la espera de confirmación de quórum o del responsable.</span>
            </div>
            {onAccept && (
              <div className="flex gap-1.5 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    await onAccept(initial.id);
                    onClose();
                  }}
                >
                  Aprobar
                </Button>
                {onReject && (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await onReject(initial.id);
                      onClose();
                    }}
                  >
                    Rechazar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Month View ─────────────────────────────────────────────────────────────

function MonthView({
  current,
  appointments,
  onDayClick,
  onAppointmentClick,
}: {
  current: Date;
  appointments: Appointment[];
  onDayClick: (day: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  // Spanish abbreviated day names starting Monday
  const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-neutral-100">
        {DOW.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-medium text-neutral-400"
          >
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-neutral-100">
        {days.map((day) => {
          const dayAppts = appointments.filter((a) =>
            isSameDay(parseISO(a.startsAt), day)
          );
          const inMonth = isSameMonth(day, current);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[90px] cursor-pointer p-1.5 hover:bg-neutral-50",
                !inMonth && "opacity-40"
              )}
              onClick={() => onDayClick(day)}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  today
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-700"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayAppts.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(a);
                    }}
                    className={cn(
                      "truncate rounded px-1 py-0.5 text-[10px] font-medium border",
                      STATUS_COLORS[a.status]
                    )}
                  >
                    {format(parseISO(a.startsAt), "HH:mm")} {a.service}
                  </div>
                ))}
                {dayAppts.length > 3 && (
                  <p className="text-[10px] text-neutral-400">
                    +{dayAppts.length - 3} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_H = 56; // px per hour

function WeekView({
  current,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: {
  current: Date;
  appointments: Appointment[];
  onSlotClick: (date: Date) => void;
  onAppointmentClick: (a: Appointment) => void;
}) {
  const weekStart = startOfWeek(current, { weekStartsOn: 1 });
  const days = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(current, { weekStartsOn: 1 }),
  });
  // Spanish abbreviated day names starting Monday
  const DOW_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <>
      {/* Mobile agenda — the dense hour grid is impractical on a phone, so the
          week shows as a per-day list instead (ADR 0021). */}
      <div className="flex-1 space-y-4 overflow-y-auto md:hidden">
        {days.map((day, i) => {
          const dayAppts = appointments
            .filter((a) => isSameDay(parseISO(a.startsAt), day))
            .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
          return (
            <div key={day.toISOString()}>
              <p
                className={cn(
                  "mb-1.5 text-xs font-semibold capitalize",
                  isToday(day) ? "text-indigo-600" : "text-neutral-500"
                )}
              >
                {DOW_SHORT[i]} {format(day, "d")}
              </p>
              {dayAppts.length === 0 ? (
                <button
                  onClick={() => {
                    const slot = new Date(day);
                    slot.setHours(9, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                  className="w-full rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-50"
                >
                  Sin citas — añadir
                </button>
              ) : (
                <div className="space-y-1.5">
                  {dayAppts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onAppointmentClick(a)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                        STATUS_COLORS[a.status]
                      )}
                    >
                      <span className="font-medium">
                        {format(parseISO(a.startsAt), "HH:mm")}
                      </span>
                      <span className="flex-1 truncate">{a.service}</span>
                      <Badge
                        variant={statusVariant(a.status)}
                        className="rounded-sm text-[10px]"
                      >
                        {statusLabel(a.status)}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hour grid — from md up (too dense for a narrow screen). */}
      <div className="hidden flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white md:flex">
      {/* Header row */}
      <div className="grid border-b border-neutral-100" style={{ gridTemplateColumns: "3rem repeat(7, 1fr)" }}>
        <div />
        {days.map((d, i) => (
          <div
            key={d.toISOString()}
            className={cn(
              "py-2 text-center text-xs font-medium",
              isToday(d) ? "text-indigo-600" : "text-neutral-400"
            )}
          >
            <div>{DOW_SHORT[i]}</div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
                isToday(d) ? "bg-indigo-600 text-white" : "text-neutral-700"
              )}
            >
              {format(d, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: "3rem repeat(7, 1fr)",
            height: HOUR_H * 24,
          }}
        >
          {/* Hour labels */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="col-start-1 flex items-start justify-end pr-2 text-[10px] text-neutral-400"
              style={{ gridRow: `${h + 1}`, height: HOUR_H, paddingTop: 2 }}
            >
              {h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
            </div>
          ))}

          {/* Day columns + grid lines */}
          {days.map((d, colIdx) => (
            <div
              key={d.toISOString()}
              className="relative border-l border-neutral-100"
              style={{ gridColumn: `${colIdx + 2}`, gridRow: "1 / 25" }}
            >
              {/* Hour cells */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-neutral-50 cursor-pointer hover:bg-indigo-50/30"
                  style={{ height: HOUR_H }}
                  onClick={() => {
                    const slot = new Date(d);
                    slot.setHours(h, 0, 0, 0);
                    onSlotClick(slot);
                  }}
                />
              ))}
              {/* Appointment blocks */}
              {appointments
                .filter((a) => isSameDay(parseISO(a.startsAt), d))
                .map((a) => {
                  const start = parseISO(a.startsAt);
                  const end = parseISO(a.endsAt);
                  const top =
                    (getHours(start) + getMinutes(start) / 60) * HOUR_H;
                  const height = Math.max(
                    (differenceInMinutes(end, start) / 60) * HOUR_H,
                    20
                  );
                  return (
                    <div
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(a);
                      }}
                      className={cn(
                        "absolute left-0.5 right-0.5 overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium border cursor-pointer hover:brightness-95",
                        STATUS_COLORS[a.status]
                      )}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate">{a.service}</div>
                      <div className="truncate opacity-75">
                        {format(start, "HH:mm")}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CalendarPageInner() {
  const searchParams = useSearchParams();

  // Lazy initializer: read the `?date=` param once on mount (ADR 0025 drill-through).
  const [current, setCurrent] = useState<Date>(() => {
    const d = searchParams.get("date");
    if (!d) return new Date();
    const parsed = parseISO(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  });

  const [view, setView] = useState<"month" | "week">("month");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | undefined>();
  const [defaultStart, setDefaultStart] = useState<Date | undefined>();

  const loadRange = useCallback(async () => {
    let from: Date;
    let to: Date;
    if (view === "month") {
      from = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
      to = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
    } else {
      from = startOfWeek(current, { weekStartsOn: 1 });
      to = endOfWeek(current, { weekStartsOn: 1 });
    }
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (selectedServiceId) {
        params.set("serviceId", selectedServiceId);
      }
      return await apiFetch<Appointment[]>(`/api/appointments?${params.toString()}`);
    } catch {
      return null;
    }
  }, [current, view, selectedServiceId]);

  const refreshRange = useCallback(async () => {
    const data = await loadRange();
    if (data) setAppointments(data);
  }, [loadRange]);

  useEffect(() => {
    loadRange().then((data) => {
      if (data) setAppointments(data);
    });
  }, [loadRange]);

  useEffect(() => {
    apiFetch<ContactPage>("/api/contacts?limit=200")
      .then((page) => setContacts(page.items))
      .catch(() => {});

    apiFetch<Service[]>("/api/services")
      .then((svcs) => setServices(svcs))
      .catch(() => {});
  }, []);

  useEvents({
    "appointment.created": () => refreshRange(),
  });

  function navigate(dir: 1 | -1) {
    if (view === "month") {
      setCurrent((c) => (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)));
    } else {
      setCurrent((c) => (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)));
    }
  }

  const title =
    view === "month"
      ? format(current, "MMMM yyyy", { locale: es })
      : `${format(startOfWeek(current, { weekStartsOn: 1 }), "d MMM", { locale: es })} – ${format(endOfWeek(current, { weekStartsOn: 1 }), "d MMM yyyy", { locale: es })}`;

  async function handleSave(data: ApptFormData) {
    const price = data.price.trim()
      ? data.price.trim()
      : editingAppt
        ? null
        : undefined;
    const payload = {
      contactId: data.contactId,
      service: data.service,
      serviceId: data.serviceId || undefined,
      calendarId: data.calendarId || undefined,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      price,
    };
    if (editingAppt) {
      await apiFetch(`/api/appointments/${editingAppt.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    await refreshRange();
  }

  async function handleAccept(id: string) {
    await apiFetch(`/api/appointments/${id}/accept`, { method: "POST" });
    await refreshRange();
  }

  async function handleReject(id: string) {
    await apiFetch(`/api/appointments/${id}/reject`, { method: "POST" });
    await refreshRange();
  }

  function openCreate(day: Date) {
    setEditingAppt(undefined);
    setDefaultStart(startOfDay(day));
    setModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setEditingAppt(a);
    setDefaultStart(undefined);
    setModalOpen(true);
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">Calendario</h1>
          <div className="flex items-center rounded-lg border border-neutral-200 bg-white text-sm">
            <button
              onClick={() => setView("month")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-l-lg transition-colors",
                view === "month"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              Mes
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-r-lg transition-colors",
                view === "week"
                  ? "bg-indigo-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              Semana
            </button>
          </div>

          {/* Service/Calendar Filter */}
          <div className="flex items-center gap-1.5">
            <select
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm focus:border-indigo-500 focus:outline-none"
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
            >
              <option value="">Todos los calendarios y servicios</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.manager ? s.manager.name.split(" ")[0] : s.calendarId})
                </option>
              ))}
            </select>
            {selectedServiceId && (
              <button
                type="button"
                onClick={() => setSelectedServiceId("")}
                className="text-xs text-neutral-400 hover:text-neutral-700 underline"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Periodo anterior"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium capitalize text-neutral-700 sm:min-w-[180px]">
              {title}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Periodo siguiente"
              onClick={() => navigate(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingAppt(undefined);
              setDefaultStart(new Date());
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva Cita
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs">
        {(["scheduled", "pending_approval", "completed", "cancelled"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-sm border",
                STATUS_COLORS[s]
              )}
            />
            <Badge variant={statusVariant(s)} className="rounded-sm">
              {statusLabel(s)}
            </Badge>
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        {view === "month" ? (
          <MonthView
            current={current}
            appointments={appointments}
            onDayClick={openCreate}
            onAppointmentClick={openEdit}
          />
        ) : (
          <WeekView
            current={current}
            appointments={appointments}
            onSlotClick={openCreate}
            onAppointmentClick={openEdit}
          />
        )}
      </div>

      <AppointmentModal
        key={modalOpen ? editingAppt?.id ?? "new" : "closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editingAppt}
        contacts={contacts}
        services={services}
        defaultStart={defaultStart}
        onSave={handleSave}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary (Next.js App Router).
export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="p-4 sm:p-8 text-sm text-neutral-400">Cargando…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}
