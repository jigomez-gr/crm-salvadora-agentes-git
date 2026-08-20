import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { TZDate } from '@date-fns/tz';
import { businessDayWindow } from './business-day';
import { computeFreeSlots, TimeSlot } from './availability';
import { WorkingHourSlot } from '../common/entities/agent-config.entity';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

// Advisory-lock key that serializes all booking writes (single bookable
// resource). Arbitrary constant; when multi-resource lands, key it per resource.
const BOOKING_LOCK_KEY = 528_491;

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(
    from?: string,
    to?: string,
    filters?: { serviceId?: string; calendarId?: string; status?: AppointmentStatus },
  ): Promise<Appointment[]> {
    const qb = this.appointmentsRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.contact', 'contact')
      .orderBy('a.startsAt', 'ASC');

    if (from && to) {
      qb.andWhere('a.startsAt BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      });
    }

    if (filters?.serviceId) {
      qb.andWhere('a.serviceId = :serviceId', { serviceId: filters.serviceId });
    }

    if (filters?.calendarId) {
      qb.andWhere('a.calendarId = :calendarId', { calendarId: filters.calendarId });
    }

    if (filters?.status) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Appointment> {
    const appt = await this.appointmentsRepo.findOne({
      where: { id },
      relations: ['contact'],
    });
    if (!appt) throw new NotFoundException(`Appointment ${id} not found`);
    return appt;
  }

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const startsAt = new Date(dto.startsAt);
    let endsAt = dto.endsAt ? new Date(dto.endsAt) : startsAt;

    let serviceEntity: Service | null = null;
    if (dto.serviceId) {
      serviceEntity = await this.servicesRepo.findOne({ where: { id: dto.serviceId } });
    } else if (dto.service) {
      serviceEntity = await this.servicesRepo.findOne({ where: { name: dto.service } });
    }

    if (serviceEntity && (!dto.endsAt || endsAt <= startsAt)) {
      endsAt = new Date(startsAt.getTime() + serviceEntity.durationMinutes * 60000);
    }

    this.assertValidWindow(startsAt, endsAt, { mustBeFuture: true });

    const calendarId = dto.calendarId || serviceEntity?.calendarId || 'default';
    const serviceName = dto.service || serviceEntity?.name || 'General';
    const serviceId = serviceEntity?.id ?? dto.serviceId ?? null;
    const price = dto.price !== undefined ? dto.price : (serviceEntity?.price ?? null);
    const defaultStatus = serviceEntity?.requiresApproval
      ? AppointmentStatus.PENDING_APPROVAL
      : AppointmentStatus.SCHEDULED;
    const status = dto.status ?? defaultStatus;

    // Serialize the "is the slot free? then book it" sequence so two concurrent
    // requests can't both claim the same slot.
    const saved = await this.appointmentsRepo.manager.transaction(
      async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        await this.checkOverlap(repo, startsAt, endsAt, undefined, calendarId, serviceId);
        const appt = repo.create({
          ...dto,
          service: serviceName,
          serviceId,
          calendarId,
          price,
          status,
          startsAt,
          endsAt,
        });
        return repo.save(appt);
      },
    );

    const withContact = await this.findOne(saved.id);
    this.eventEmitter.emit('appointment.created', withContact);
    return withContact;
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const appt = await this.findOne(id);

    const newStart = dto.startsAt ? new Date(dto.startsAt) : appt.startsAt;
    const newEnd = dto.endsAt ? new Date(dto.endsAt) : appt.endsAt;
    const timeChanged = Boolean(dto.startsAt || dto.endsAt);

    if (timeChanged) {
      this.assertValidWindow(newStart, newEnd, { mustBeFuture: false });
      appt.startsAt = newStart;
      appt.endsAt = newEnd;
    }

    if (dto.serviceId !== undefined) {
      appt.serviceId = dto.serviceId || null;
      if (dto.serviceId) {
        const svc = await this.servicesRepo.findOne({ where: { id: dto.serviceId } });
        if (svc) {
          appt.service = svc.name;
          if (dto.calendarId === undefined) appt.calendarId = svc.calendarId;
          if (dto.price === undefined && svc.price) appt.price = svc.price;
        }
      }
    }
    if (dto.service) appt.service = dto.service;
    if (dto.calendarId !== undefined) appt.calendarId = dto.calendarId || 'default';
    if (dto.notes !== undefined) appt.notes = dto.notes || null;

    if (dto.price !== undefined) {
      appt.price = dto.price === '' ? null : dto.price;
    }

    if (dto.status && dto.status !== appt.status) {
      appt.status = dto.status;
      if (dto.status === AppointmentStatus.CANCELLED) {
        appt.cancelledAt = appt.cancelledAt ?? new Date();
        appt.cancelledBy = appt.cancelledBy ?? 'system';
      }
    }

    const calendarId = dto.calendarId || appt.calendarId || 'default';
    const serviceId = appt.serviceId;

    if (timeChanged && appt.status !== AppointmentStatus.CANCELLED) {
      return this.appointmentsRepo.manager.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          BOOKING_LOCK_KEY,
        ]);
        const repo = manager.getRepository(Appointment);
        await this.checkOverlap(repo, newStart, newEnd, appt.id, calendarId, serviceId);
        return repo.save(appt);
      });
    }

    const updated = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', updated);
    return updated;
  }

  /** Accept an appointment (responsible manager approval) */
  async accept(id: string, acceptedBy: string): Promise<Appointment> {
    const appt = await this.findOne(id);
    appt.status = AppointmentStatus.SCHEDULED;
    appt.acceptedAt = new Date();
    appt.acceptedBy = acceptedBy;
    const saved = await this.appointmentsRepo.save(appt);
    this.eventEmitter.emit('appointment.created', saved);
    return saved;
  }

  /** Reject an appointment (responsible manager rejection) */
  async reject(id: string, rejectedBy: string, reason?: string): Promise<Appointment> {
    return this.cancel(id, rejectedBy, reason || 'Rechazada por el responsable del servicio');
  }

  /** Logical cancellation — preserves the row (and its history) instead of deleting. */
  async cancel(
    id: string,
    cancelledBy: string,
    reason?: string,
  ): Promise<Appointment> {
    const appt = await this.findOne(id);
    if (appt.status !== AppointmentStatus.CANCELLED) {
      appt.status = AppointmentStatus.CANCELLED;
      appt.cancelledAt = new Date();
      appt.cancelledBy = cancelledBy;
      appt.cancellationReason = reason ?? null;
      await this.appointmentsRepo.save(appt);
      this.eventEmitter.emit('appointment.created', appt);
    }
    return appt;
  }

  // ─── Validation helpers ───

  private assertValidWindow(
    startsAt: Date,
    endsAt: Date,
    opts: { mustBeFuture: boolean },
  ): void {
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException('Las fechas de la cita no son válidas.');
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio.',
      );
    }
    // 60s of grace to avoid rejecting "now" due to request latency.
    if (opts.mustBeFuture && startsAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('No se puede crear una cita en el pasado.');
    }
  }

  /**
   * Reject a booking that overlaps an existing non-cancelled appointment on the SAME calendar
   * OR across any service managed by the same responsible manager.
   */
  private async checkOverlap(
    repo: Repository<Appointment>,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
    calendarId = 'default',
    serviceId?: string | null,
  ): Promise<void> {
    let managerServiceIds: string[] = [];
    if (serviceId) {
      const targetService = await this.servicesRepo.findOne({ where: { id: serviceId } });
      if (targetService?.managerId) {
        const sharedServices = await this.servicesRepo.find({
          where: { managerId: targetService.managerId },
          select: ['id'],
        });
        managerServiceIds = sharedServices.map((s) => s.id);
      }
    }

    const qb = repo
      .createQueryBuilder('a')
      .where('a.status != :cancelled', {
        cancelled: AppointmentStatus.CANCELLED,
      })
      .andWhere('a.startsAt < :endsAt', { endsAt })
      .andWhere('a.endsAt > :startsAt', { startsAt });

    if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    if (excludeId) qb.andWhere('a.id != :excludeId', { excludeId });
    const conflicts = await qb.getCount();
    if (conflicts > 0) {
      throw new ConflictException(
        'Ese horario ya está ocupado en este calendario o por el responsable del servicio. Elige otro hueco libre.',
      );
    }
  }

  async countToday(
    timezone = process.env.BUSINESS_TIMEZONE || 'Europe/Madrid',
  ): Promise<number> {
    const { start, end } = businessDayWindow(new Date(), timezone);
    return this.appointmentsRepo.count({
      where: {
        startsAt: Between(start, new Date(end.getTime() - 1)),
        status: AppointmentStatus.SCHEDULED,
      },
    });
  }

  async countPending(): Promise<number> {
    return this.appointmentsRepo.count({
      where: {
        status: AppointmentStatus.PENDING_APPROVAL,
      },
    });
  }

  async findToday(
    timezone = process.env.BUSINESS_TIMEZONE || 'Europe/Madrid',
  ): Promise<Appointment[]> {
    const { start, end } = businessDayWindow(new Date(), timezone);
    return this.appointmentsRepo.find({
      where: { startsAt: Between(start, new Date(end.getTime() - 1)) },
      order: { startsAt: 'ASC' },
      relations: ['contact'],
    });
  }

  async findUpcoming(limit = 5): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { status: AppointmentStatus.SCHEDULED },
      order: { startsAt: 'ASC' },
      take: limit,
      relations: ['contact'],
    });
  }

  async getAvailableSlots(
    date: Date,
    durationMinutes: number,
    workingHours: WorkingHourSlot[],
    timezone = 'Europe/Madrid',
    now = new Date(),
    calendarId = 'default',
    serviceId?: string,
  ): Promise<TimeSlot[]> {
    // Day window in the business timezone
    const zoned = new TZDate(date.getTime(), timezone);
    const dayStart = new TZDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    let managerServiceIds: string[] = [];
    if (serviceId) {
      const targetService = await this.servicesRepo.findOne({ where: { id: serviceId } });
      if (targetService?.calendarId) calendarId = targetService.calendarId;
      if (targetService?.managerId) {
        const sharedServices = await this.servicesRepo.find({
          where: { managerId: targetService.managerId },
          select: ['id'],
        });
        managerServiceIds = sharedServices.map((s) => s.id);
      }
    }

    const qb = this.appointmentsRepo
      .createQueryBuilder('a')
      .where('a.startsAt BETWEEN :start AND :end', {
        start: new Date(dayStart.getTime()),
        end: dayEnd,
      })
      .andWhere('a.status != :cancelled', { cancelled: AppointmentStatus.CANCELLED });

    if (managerServiceIds.length > 0) {
      qb.andWhere(
        '(a.calendarId = :calendarId OR a.serviceId IN (:...managerServiceIds))',
        { calendarId, managerServiceIds },
      );
    } else {
      qb.andWhere('a.calendarId = :calendarId', { calendarId });
    }

    const existing = await qb.getMany();

    return computeFreeSlots(date, durationMinutes, workingHours, existing, {
      timezone,
      now,
    });
  }

  /** Cancellation requested by the AI agent (on the customer's behalf). */
  async cancelAppointment(id: string): Promise<Appointment> {
    return this.cancel(id, 'agent');
  }

  async findByContact(contactId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { contactId },
      order: { startsAt: 'DESC' },
    });
  }
}
