import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TZDate } from '@date-fns/tz';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import {
  Appointment,
  AppointmentStatus,
} from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { User, UserRole } from '../common/entities/user.entity';
import {
  MediaType,
  Message,
  MessageChannel,
  MessageDirection,
} from '../common/entities/message.entity';
import { MessagesService } from '../conversations/messages.service';
import { PipelineStage } from '../contacts/pipeline';

// Business timezone the demo appointments are placed in. TZDate converts the
// wall-clock time below into the correct UTC instant (handles CET/CEST).
const TZ = 'Europe/Madrid';

// Service keys & durations for seed mapping
const SVC = {
  yoga: { name: 'Clase de Yoga (Hatha / Vinyasa)', dur: 75 },
  gong: { name: 'Baño de Gong (Sonoterapia)', dur: 60 },
  puja: { name: 'Puja de Gong (Noche de Gong)', dur: 480 },
  gestalt: { name: 'Terapia Gestalt (Individual)', dur: 60 },
  constelaciones: { name: 'Taller de Constelaciones Familiares', dur: 180 },
  mujeres: { name: 'Encuentro de Mujeres (Círculo y Retiro)', dur: 240 },
  ayuno: { name: 'Ayuno Terapéutico & Retiro Detox', dur: 360 },
};

/**
 * Loads demo data (contacts + appointments + conversations + service managers + services)
 * the FIRST time the app runs against an empty database.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly messagesService: MessagesService,
  ) {}

  async onModuleInit() {
    if (process.env.SEED_DEMO_DATA === 'false') {
      this.logger.log('SEED_DEMO_DATA=false — skipping demo data seed');
      return;
    }

    const servicesCount = await this.servicesRepo.count();
    const contactsCount = await this.contactsRepo.count();

    if (servicesCount === 0 && contactsCount > 0) {
      this.logger.log('Existing contacts found but services table is empty. Wiping stale demo data to reseed full suite (services, managers, multi-calendar appointments)...');
      await this.contactsRepo.query('TRUNCATE TABLE appointment_reminders, appointments, messages, conversations, contacts, services CASCADE;');
      await this.seed();
      return;
    }

    if (contactsCount > 0) {
      this.logger.log(
        `Demo data seed skipped — database already has ${contactsCount} contact(s) and ${servicesCount} service(s)`,
      );
      return;
    }

    await this.seed();
  }

  private async seed() {
    this.logger.log('Empty database detected — seeding demo data for Centro Holístico y Escuela de Yoga');

    // ─── Seed Responsables de Servicio (Service Managers) ───
    const defaultPasswordHash = '$2a$10$wE97wO6o07Y9v10n936d8.tqF7/e5R3oW52i2F7pA5U9eG1rK93u2'; // Admin1234!

    const managerSeeds = [
      {
        name: 'Laura Navarro (Shakti - Resp. Yoga)',
        email: 'yoga@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Marcos Benítez (Vikram - Maestro de Gong)',
        email: 'gong@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Dra. Elena Salgado (Resp. Gestalt y Constelaciones)',
        email: 'gestalt@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
      {
        name: 'Silvia Morales (Resp. Encuentros y Retiros)',
        email: 'eventos@crmacademy.local',
        role: UserRole.SERVICE_MANAGER,
      },
    ];

    const managers: Record<string, User> = {};
    for (const m of managerSeeds) {
      let u = await this.usersRepo.findOne({ where: { email: m.email } });
      if (!u) {
        u = await this.usersRepo.save(
          this.usersRepo.create({
            name: m.name,
            email: m.email,
            passwordHash: defaultPasswordHash,
            role: m.role,
            isActive: true,
          }),
        );
      }
      managers[m.email] = u;
    }

    // ─── Seed Services with distinct calendars, prices, managers, and approval rules ───
    const serviceList = [
      {
        name: SVC.yoga.name,
        description: 'Práctica consciente de asanas, pranayama y meditación guiada en grupo reducido.',
        durationMinutes: 75,
        price: '15.00',
        calendarId: 'cal-yoga',
        managerId: managers['yoga@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.gong.name,
        description: 'Inmersión acústica vibracional con gongs sinfónicos y cuencos tibetanos para relajación profunda.',
        durationMinutes: 60,
        price: '35.00',
        calendarId: 'cal-gong',
        managerId: managers['gong@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.puja.name,
        description: 'Ceremonia nocturna de sonido sagrado ininterrumpido durante 8 horas. Traer esterilla, manta y zafu.',
        durationMinutes: 480,
        price: '85.00',
        calendarId: 'cal-pujas',
        managerId: managers['gong@crmacademy.local'].id,
        requiresApproval: true,
      },
      {
        name: SVC.gestalt.name,
        description: 'Psicoterapia humanista centrada en el aquí y el ahora, gestión emocional y crecimiento personal.',
        durationMinutes: 60,
        price: '60.00',
        calendarId: 'cal-gestalt',
        managerId: managers['gestalt@crmacademy.local'].id,
        requiresApproval: false,
      },
      {
        name: SVC.constelaciones.name,
        description: 'Taller vivencial para sanar dinámicas familiares, patrones transgeneracionales y bloqueos vitales.',
        durationMinutes: 180,
        price: '50.00',
        calendarId: 'cal-constelaciones',
        managerId: managers['gestalt@crmacademy.local'].id,
        requiresApproval: true,
      },
      {
        name: SVC.mujeres.name,
        description: 'Círculo sagrado femenino y retiro de autoconocimiento. Requiere un mínimo de 8 participantes para confirmar el evento.',
        durationMinutes: 240,
        price: '75.00',
        calendarId: 'cal-eventos-mujeres',
        managerId: managers['eventos@crmacademy.local'].id,
        requiresApproval: true,
      },
      {
        name: SVC.ayuno.name,
        description: 'Retiro y acompañamiento en ayuno consciente y detox integral. Requiere un mínimo de 6 participantes; de no alcanzarse el cupo se cancela o reprograma.',
        durationMinutes: 360,
        price: '220.00',
        calendarId: 'cal-ayunos',
        managerId: managers['eventos@crmacademy.local'].id,
        requiresApproval: true,
      },
    ];

    const seededServices = await this.servicesRepo.save(
      serviceList.map((s) => this.servicesRepo.create(s)),
    );
    const svcMap = new Map(seededServices.map((s) => [s.name, s]));

    // ─── 10 Realistic Contacts ───
    const contactSeed = [
      {
        name: 'Lucía Fernández',
        phone: '+34611200301',
        email: 'lucia.fernandez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['yoga', 'retiro', 'ayuno'],
        notes: 'Alumna regular de Vinyasa Yoga. Inscrita en el próximo Retiro de Ayuno Terapéutico.',
      },
      {
        name: 'Carlos Ruiz',
        phone: '+34611200302',
        email: 'carlos.ruiz@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gong', 'relajacion'],
        notes: 'Asiste a baños de gong mensuales para aliviar estrés laboral. Prefiere sesiones de tarde.',
      },
      {
        name: 'María García',
        phone: '+34611200303',
        email: 'maria.garcia@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['mujeres', 'eventos'],
        notes: 'Interesada en el Encuentro de Mujeres. Pregunta por WhatsApp si ya se completó el quórum mínimo de 8 personas.',
      },
      {
        name: 'Javier Moreno',
        phone: '+34611200304',
        email: 'javier.moreno@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['gestalt'],
        notes: 'Proceso de psicoterapia Gestalt en curso con la Dra. Elena Salgado. Sesión quincenal.',
      },
      {
        name: 'Ana Martín',
        phone: '+34611200305',
        email: 'ana.martin@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gong', 'puja', 'sonoterapia'],
        notes: 'Confirmada para la próxima Puja de Gong nocturna. Traerá su propio zafu y manta.',
      },
      {
        name: 'David López',
        phone: '+34611200306',
        email: 'david.lopez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.CONTACTED,
        tags: ['constelaciones'],
        notes: 'Solicitó información para constelar un conflicto familiar en el taller del sábado.',
      },
      {
        name: 'Elena Sánchez',
        phone: '+34611200307',
        email: 'elena.sanchez@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.WON,
        tags: ['yoga', 'gong', 'vip'],
        notes: 'Miembro del centro desde 2023. Combina abono mensual de Yoga y Baños de Gong.',
      },
      {
        name: 'Pablo Díaz',
        phone: '+34611200308',
        email: 'pablo.diaz@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.QUALIFIED,
        tags: ['ayuno', 'retiro'],
        notes: 'Preinscrito al Ayuno Terapéutico. Informado de que se confirmará definitivamente al llegar al cupo de 6 participantes.',
      },
      {
        name: 'Carmen Jiménez',
        phone: '+34611200309',
        email: 'carmen.jimenez@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.NEW,
        tags: ['mujeres', 'yoga-suave'],
        notes: 'Nueva interesada en el Círculo de Mujeres y clases de yoga restaurativo.',
      },
      {
        name: 'Sergio Romero',
        phone: '+34611200310',
        email: 'sergio.romero@example.com',
        status: ContactStatus.ACTIVE,
        pipelineStage: PipelineStage.BOOKED,
        tags: ['gestalt', 'gong'],
        notes: 'Combina sesiones individuales de Gestalt con baños de gong de integración emocional.',
      },
    ];

    const contacts = await this.contactsRepo.save(
      contactSeed.map((c) => this.contactsRepo.create(c)),
    );

    // ─── Date helpers (relative to "now" so the demo is always current) ───
    const nowZ = new TZDate(Date.now(), TZ);
    const baseY = nowZ.getFullYear();
    const baseMo = nowZ.getMonth();
    const baseD = nowZ.getDate();

    const dayParts = (offset: number) => {
      const d = new TZDate(baseY, baseMo, baseD + offset, 12, 0, TZ);
      return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), dow: d.getDay() };
    };
    const isoAt = (p: { y: number; mo: number; d: number }, hh: number, mm = 0) =>
      new TZDate(p.y, p.mo, p.d, hh, mm, TZ).toISOString();
    const plusMin = (iso: string, min: number) =>
      new Date(new Date(iso).getTime() + min * 60000).toISOString();

    // Upcoming weekdays starting today, and a couple of past ones.
    const fwd: ReturnType<typeof dayParts>[] = [];
    for (let off = 0; fwd.length < 9; off++) {
      const p = dayParts(off);
      if (p.dow >= 1 && p.dow <= 6) fwd.push(p);
    }
    const back: ReturnType<typeof dayParts>[] = [];
    for (let off = -1; back.length < 2; off--) {
      const p = dayParts(off);
      if (p.dow >= 1 && p.dow <= 6) back.push(p);
    }

    // ─── 14 Realistic Appointments across calendars & statuses ───
    const specs: {
      day: { y: number; mo: number; d: number };
      hh: number;
      mm: number;
      c: number;
      s: { name: string; dur: number };
      st: AppointmentStatus;
      notes?: string;
      cancellationReason?: string;
    }[] = [
      // Hoy
      { day: fwd[0], hh: 9, mm: 30, c: 0, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Clase Vinyasa matinal' },
      { day: fwd[0], hh: 18, mm: 0, c: 1, s: SVC.gong, st: AppointmentStatus.SCHEDULED, notes: 'Baño de Gong relajación' },
      { day: fwd[0], hh: 19, mm: 30, c: 3, s: SVC.gestalt, st: AppointmentStatus.SCHEDULED, notes: 'Sesión individual de seguimiento' },

      // Mañana
      { day: fwd[1], hh: 10, mm: 0, c: 4, s: SVC.puja, st: AppointmentStatus.SCHEDULED, notes: 'Puja de Gong noche sagrada' },
      { day: fwd[1], hh: 17, mm: 0, c: 6, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Clase Hatha Yoga suave' },

      // Días siguientes
      { day: fwd[2], hh: 10, mm: 30, c: 5, s: SVC.constelaciones, st: AppointmentStatus.PENDING_APPROVAL, notes: 'Taller de Constelaciones (pendiente de confirmar plaza para constelar)' },
      { day: fwd[2], hh: 19, mm: 0, c: 9, s: SVC.gestalt, st: AppointmentStatus.SCHEDULED, notes: 'Sesión quincenal de Gestalt' },
      { day: fwd[3], hh: 11, mm: 0, c: 2, s: SVC.mujeres, st: AppointmentStatus.PENDING_APPROVAL, notes: 'Encuentro de Mujeres (7/8 inscritas - pendiente de quórum)' },
      { day: fwd[3], hh: 18, mm: 30, c: 7, s: SVC.ayuno, st: AppointmentStatus.PENDING_APPROVAL, notes: 'Retiro de Ayuno Terapéutico (5/6 preinscritos - pendiente de 1 participante más para confirmar)' },
      { day: fwd[4], hh: 12, mm: 0, c: 8, s: SVC.yoga, st: AppointmentStatus.SCHEDULED, notes: 'Clase de Yoga Restaurativo' },
      { day: fwd[5], hh: 17, mm: 30, c: 1, s: SVC.gong, st: AppointmentStatus.SCHEDULED, notes: 'Baño de Gong fin de semana' },

      // Cita cancelada por no alcanzar el quórum mínimo en una edición anterior
      {
        day: fwd[6],
        hh: 10,
        mm: 0,
        c: 7,
        s: SVC.ayuno,
        st: AppointmentStatus.CANCELLED,
        notes: 'Edición anterior del Retiro de Ayuno',
        cancellationReason: 'Evento cancelado al no alcanzarse el quórum mínimo de 6 participantes.',
      },

      // Citas pasadas completadas
      { day: back[0], hh: 18, mm: 0, c: 0, s: SVC.gong, st: AppointmentStatus.COMPLETED, notes: 'Baño de Gong completado con éxito' },
      { day: back[1], hh: 17, mm: 0, c: 3, s: SVC.gestalt, st: AppointmentStatus.COMPLETED, notes: 'Sesión Gestalt completada' },
    ];

    const appts = specs.map((sp) => {
      const startsAt = isoAt(sp.day, sp.hh, sp.mm);
      const svcEntity = svcMap.get(sp.s.name);
      return this.appointmentsRepo.create({
        contactId: contacts[sp.c].id,
        service: sp.s.name,
        serviceId: svcEntity?.id ?? null,
        calendarId: svcEntity?.calendarId ?? 'default',
        price: svcEntity?.price ?? null,
        startsAt: new Date(startsAt),
        endsAt: new Date(plusMin(startsAt, sp.s.dur)),
        status: sp.st,
        notes: sp.notes ?? null,
        cancellationReason: sp.cancellationReason ?? null,
        cancelledAt: sp.st === AppointmentStatus.CANCELLED ? new Date() : null,
      });
    });
    await this.appointmentsRepo.save(appts);

    // ─── WhatsApp Conversations ───
    const thread = (contact: Contact, lines: [MessageDirection, string][]) =>
      lines.map(([direction, body]) =>
        this.messagesRepo.create({
          contactId: contact.id,
          threadId: `booking:${contact.phone}`,
          direction,
          channel: MessageChannel.WHATSAPP,
          body,
        }),
      );

    const messages = [
      ...thread(contacts[0], [
        [MessageDirection.INBOUND, '¡Hola! Quería consultar sobre el próximo Retiro de Ayuno Terapéutico.'],
        [
          MessageDirection.OUTBOUND,
          '¡Hola Lucía! Qué alegría saludarte. El retiro de ayuno está programado para los próximos días. Es guiado y supervisado paso a paso.',
        ],
        [MessageDirection.INBOUND, '¿Es necesario un grupo mínimo para que se realice?'],
        [
          MessageDirection.OUTBOUND,
          'Sí, para garantizar la dinámica grupal necesitamos un mínimo de 6 participantes. ¡Actualmente llevamos 5 preinscripciones, por lo que con una más quedará 100% confirmado!',
        ],
      ]),
      ...thread(contacts[1], [
        [MessageDirection.INBOUND, 'Buenas tardes, ¿qué tengo que llevar para el Baño de Gong de las 18:00?'],
        [
          MessageDirection.OUTBOUND,
          '¡Hola Carlos! Te recomendamos ropa cómoda y abrigada (calcetines calientes). En la sala disponemos de esterillas, zafus y mantas, pero puedes traer tu propia manta si lo prefieres.',
        ],
        [MessageDirection.INBOUND, 'Perfecto, muchas gracias. Allí nos vemos.'],
        [MessageDirection.OUTBOUND, '¡A ti! Te esperamos a las 18:00 para disfrutar del sonido y la vibración del Gong.'],
      ]),
    ];

    // Demo image attachment
    const demoImageSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="260">` +
      `<rect width="360" height="260" fill="#fef3c7"/>` +
      `<circle cx="180" cy="110" r="55" fill="#f59e0b"/>` +
      `<circle cx="180" cy="110" r="45" fill="#d97706"/>` +
      `<text x="180" y="220" font-family="sans-serif" font-size="16" fill="#92400e" font-weight="bold" text-anchor="middle">Sonoterapia &amp; Yoga Prana</text>` +
      `</svg>`;

    messages.push(
      this.messagesRepo.create({
        contactId: contacts[1].id,
        threadId: `booking:${contacts[1].phone}`,
        direction: MessageDirection.INBOUND,
        channel: MessageChannel.WHATSAPP,
        body: '📷 Imagen',
        mediaType: MediaType.IMAGE,
        mediaUrl:
          'data:image/svg+xml;base64,' +
          Buffer.from(demoImageSvg).toString('base64'),
        mediaMimeType: 'image/svg+xml',
      }),
    );

    await this.messagesRepo.save(messages);
    // Messages were inserted directly (not through MessagesService), so build
    // their conversation rows now — otherwise the seeded threads wouldn't show
    // up in the inbox (which reads from `conversations`).
    await this.messagesService.rebuildAllConversations();

    this.logger.log(
      `Demo data seeded: ${contacts.length} contacts, ${appts.length} appointments, ${seededServices.length} services, ${messages.length} messages`,
    );
  }
}
