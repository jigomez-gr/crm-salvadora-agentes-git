"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, Sparkles, Calendar, UserCheck, Clock, Tag, AlertCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Service, User } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

interface ServiceFormData {
  name: string;
  description: string;
  durationMinutes: number;
  price: string;
  calendarId: string;
  managerId: string;
  requiresApproval: boolean;
  isActive: boolean;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState<ServiceFormData>({
    name: "",
    description: "",
    durationMinutes: 60,
    price: "",
    calendarId: "",
    managerId: "",
    requiresApproval: false,
    isActive: true,
  });

  const refreshData = useCallback(async () => {
    try {
      const [svcs, mgrs] = await Promise.all([
        apiFetch<Service[]>("/api/services"),
        apiFetch<User[]>("/api/services/managers/list"),
      ]);
      setServices(svcs);
      setManagers(mgrs);
    } catch {
      toast.error("Error al cargar los servicios");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<Service[]>("/api/services"),
      apiFetch<User[]>("/api/services/managers/list"),
    ])
      .then(([svcs, mgrs]) => {
        if (!active) return;
        setServices(svcs);
        setManagers(mgrs);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        toast.error("Error al cargar los servicios");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  function openCreate() {
    setEditingService(null);
    setForm({
      name: "",
      description: "",
      durationMinutes: 60,
      price: "",
      calendarId: "",
      managerId: managers[0]?.id ?? "",
      requiresApproval: false,
      isActive: true,
    });
    setError("");
    setModalOpen(true);
  }

  function openEdit(svc: Service) {
    setEditingService(svc);
    setForm({
      name: svc.name,
      description: svc.description ?? "",
      durationMinutes: svc.durationMinutes,
      price: svc.price ?? "",
      calendarId: svc.calendarId ?? "",
      managerId: svc.managerId ?? "",
      requiresApproval: Boolean(svc.requiresApproval),
      isActive: svc.isActive ?? true,
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre del servicio es obligatorio.");
      return;
    }
    if (form.durationMinutes <= 0) {
      setError("La duración debe ser mayor a 0 minutos.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      durationMinutes: Number(form.durationMinutes),
      price: form.price.trim() || undefined,
      calendarId: form.calendarId.trim() || undefined,
      managerId: form.managerId || undefined,
      requiresApproval: form.requiresApproval,
      isActive: form.isActive,
    };

    try {
      if (editingService) {
        await apiFetch(`/api/services/${editingService.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Servicio actualizado correctamente");
      } else {
        await apiFetch("/api/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Servicio creado correctamente");
      }
      setModalOpen(false);
      await refreshData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar el servicio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900">Servicios y Calendarios</h1>
            <Badge variant="info" className="text-xs">
              {services.length} {services.length === 1 ? "servicio" : "servicios"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Define los servicios, sus calendarios asignados y los responsables de cada disciplina.
          </p>
        </div>

        {user?.role === "admin" && (
          <Button onClick={openCreate} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Nuevo Servicio
          </Button>
        )}
      </div>

      {/* Grid of services */}
      {loading ? (
        <div className="py-12 text-center text-sm text-neutral-400">Cargando servicios…</div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-neutral-300" />
          <h3 className="mt-3 text-base font-medium text-neutral-900">No hay servicios definidos</h3>
          <p className="mt-1 text-sm text-neutral-500">Crea los servicios y asígnalos a los responsables.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-neutral-900 text-base">{s.name}</h3>
                  <div className="flex items-center gap-1">
                    {s.isActive ? (
                      <Badge variant="success" className="text-[10px]">Activo</Badge>
                    ) : (
                      <Badge variant="danger" className="text-[10px]">Inactivo</Badge>
                    )}
                  </div>
                </div>

                {s.description && (
                  <p className="mt-2 text-xs text-neutral-600 line-clamp-2">
                    {s.description}
                  </p>
                )}

                <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3 text-xs">
                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-neutral-400" />
                      Duración:
                    </span>
                    <span className="font-semibold text-neutral-800">{s.durationMinutes} min</span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-neutral-400" />
                      Precio:
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {s.price ? `${s.price} €` : "No especificado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                      Calendario:
                    </span>
                    <span className="font-mono text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700">
                      {s.calendarId}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                      Responsable:
                    </span>
                    <span className="font-medium text-indigo-700 truncate max-w-[150px]">
                      {s.manager?.name || "Sin asignar"}
                    </span>
                  </div>

                  {s.requiresApproval && (
                    <div className="mt-1 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 border border-amber-200">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      Requiere aprobación previa
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEdit(s)}
                  className="flex items-center gap-1 text-xs"
                >
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingService ? "Editar Servicio" : "Nuevo Servicio"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Nombre del Servicio <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  calendarId: f.calendarId || (editingService ? f.calendarId : `cal-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`),
                }));
              }}
              placeholder="ej. Clase de Yoga Vinyasa"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Descripción / Condiciones
            </label>
            <textarea
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Indica de qué trata el servicio, qué material traer o si requiere quórum mínimo…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Duración (minutos) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="5"
                step="5"
                value={form.durationMinutes}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Precio (€)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="ej. 35.00"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Responsable del Servicio
            </label>
            <select
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              value={form.managerId}
              onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
            >
              <option value="">Sin responsable específico</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-500">
              Las citas de este servicio bloquearán la disponibilidad del responsable para todos los servicios que gestione.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Identificador de Calendario
            </label>
            <Input
              value={form.calendarId}
              onChange={(e) => setForm((f) => ({ ...f, calendarId: e.target.value }))}
              placeholder="ej. cal-yoga"
            />
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                checked={form.requiresApproval}
                onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
              />
              <span>Requiere aprobación previa del responsable antes de confirmarse</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>Servicio activo y disponible para reservas</span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Servicio"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
