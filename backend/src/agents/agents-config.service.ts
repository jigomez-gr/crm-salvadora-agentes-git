import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConfig } from '../common/entities/agent-config.entity';
import {
  CreateAgentConfigDto,
  UpdateAgentConfigDto,
} from './dto/agent-config.dto';

// Default model for a newly-created agent (owner-chosen): gpt-4.1-mini is the most
// reliable of the cheap tier at tool-calling + instruction-following, so a
// non-technical owner gets dependable bookings out of the box. It's in
// RECOMMENDED_MODELS; owners can switch to any model from the UI.
export const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

// Secret fields that must NEVER be sent to the browser/API clients.
const SECRET_FIELDS = [
  'openrouterApiKey',
  'ycloudApiKey',
  'ycloudWebhookSecret',
] as const;

/**
 * Strip secret values from an agent config before returning it to a client.
 * The real values stay in the DB; clients only learn whether each one is set
 * (e.g. `hasOpenrouterApiKey: true`) so the UI can show "configured" without
 * ever exposing the secret.
 */
export function sanitizeAgentConfig(config: AgentConfig): Record<string, any> {
  const clone: Record<string, any> = { ...config };
  for (const field of SECRET_FIELDS) {
    const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
    clone[`has${capitalized}`] = !!clone[field];
    delete clone[field];
  }
  return clone;
}

@Injectable()
export class AgentsConfigService implements OnModuleInit {
  private readonly logger = new Logger(AgentsConfigService.name);

  constructor(
    @InjectRepository(AgentConfig)
    private readonly configRepo: Repository<AgentConfig>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultIfMissing();
  }

  private async seedDefaultIfMissing() {
    const existing = await this.configRepo.findOne({ where: { agentKey: 'booking' } });
    if (!existing) {
      this.logger.log('Seeding default booking agent config (centro holístico y yoga)');
      const config = this.configRepo.create({
        agentKey: 'booking',
        businessName: 'Centro Holístico & Escuela de Yoga Prana',
        businessDescription:
          'Centro integral de desarrollo personal y bienestar. Ofrecemos clases de Yoga (Hatha, Vinyasa, Kundalini), Baños y Pujas de Gong, Terapia Gestalt individual, Talleres de Constelaciones Familiares, Encuentros de Mujeres y Retiros de Ayuno Terapéutico.',
        channel: 'whatsapp',
        services: [
          { name: 'Clase de Yoga (Hatha / Vinyasa)', durationMinutes: 75 },
          { name: 'Baño de Gong (Sonoterapia)', durationMinutes: 60 },
          { name: 'Puja de Gong (Noche de Gong)', durationMinutes: 480 },
          { name: 'Terapia Gestalt (Individual)', durationMinutes: 60 },
          { name: 'Taller de Constelaciones Familiares', durationMinutes: 180 },
          { name: 'Encuentro de Mujeres (Círculo y Retiro)', durationMinutes: 240 },
          { name: 'Ayuno Terapéutico & Retiro Detox', durationMinutes: 360 },
        ],
        workingHours: [
          { day: 1, open: '08:30', close: '21:30' }, // Lunes
          { day: 2, open: '08:30', close: '21:30' }, // Martes
          { day: 3, open: '08:30', close: '21:30' }, // Miércoles
          { day: 4, open: '08:30', close: '21:30' }, // Jueves
          { day: 5, open: '08:30', close: '21:30' }, // Viernes
          { day: 6, open: '09:00', close: '20:00' }, // Sábado
          { day: 0, open: '10:00', close: '14:00' }, // Domingo
        ],
        tone: 'cálido, consciente y profesional',
        customInstructions:
          'Normas y conocimientos del Centro:\n' +
          '1. Retiros y Eventos Especiales con quórum mínimo:\n' +
          '   - Encuentros de Mujeres: Requieren un mínimo de 8 participantes para confirmarse.\n' +
          '   - Ayunos Terapéuticos & Detox: Requieren un mínimo de 6 participantes. Si no se alcanza el cupo, el evento se cancela o pospone avisando con antelación y devolviendo reservas.\n' +
          '2. Baños y Pujas de Gong:\n' +
          '   - Baños de Gong (60 min, 35€): Relajación profunda y sonoterapia. Ropa cómoda.\n' +
          '   - Pujas de Gong (8h noche completa, 85€): Se requiere traer esterilla, manta y cojín (zafu).\n' +
          '3. Coordinadores por disciplina:\n' +
          '   - Escuela de Yoga: Laura Navarro (Shakti)\n' +
          '   - Sonoterapia y Gongs: Marcos Benítez (Vikram)\n' +
          '   - Gestalt y Constelaciones: Dra. Elena Salgado\n' +
          '   - Encuentros de Mujeres y Retiros de Ayuno: Silvia Morales',
        model: DEFAULT_MODEL,
        whatsappNumber: process.env.YCLOUD_WHATSAPP_NUMBER || undefined,
        enabled: true,
      });
      await this.configRepo.save(config);
    } else if (!existing.whatsappNumber && process.env.YCLOUD_WHATSAPP_NUMBER) {
      existing.whatsappNumber = process.env.YCLOUD_WHATSAPP_NUMBER;
      await this.configRepo.save(existing);
    }
  }

  async findAll(): Promise<AgentConfig[]> {
    return this.configRepo.find({ order: { createdAt: 'ASC' } });
  }

  async findByKey(agentKey: string): Promise<AgentConfig> {
    const config = await this.configRepo.findOne({ where: { agentKey } });
    if (!config) throw new NotFoundException(`Agent config for key '${agentKey}' not found`);
    return config;
  }

  /** Like findByKey but returns null instead of throwing (for hot paths like the agent runner). */
  async findByKeyOrNull(agentKey: string): Promise<AgentConfig | null> {
    return this.configRepo.findOne({ where: { agentKey } });
  }

  async create(dto: CreateAgentConfigDto): Promise<AgentConfig> {
    const agentKey = await this.generateUniqueKey(dto.businessName);
    const config = this.configRepo.create({
      agentKey,
      businessName: dto.businessName,
      businessDescription: dto.businessDescription || '',
      channel: dto.channel || 'whatsapp',
      services: [],
      workingHours: [
        { day: 1, open: '09:00', close: '18:00' },
        { day: 2, open: '09:00', close: '18:00' },
        { day: 3, open: '09:00', close: '18:00' },
        { day: 4, open: '09:00', close: '18:00' },
        { day: 5, open: '09:00', close: '18:00' },
      ],
      tone: 'amable y profesional',
      model: dto.model || DEFAULT_MODEL,
      enabled: true,
    });
    return this.configRepo.save(config);
  }

  async update(agentKey: string, dto: UpdateAgentConfigDto): Promise<AgentConfig> {
    const config = await this.findByKey(agentKey);
    // An empty/undefined secret means "leave it unchanged" — never overwrite a
    // stored secret with a blank value (the API no longer returns secrets, so
    // the UI sends them back empty for fields the user didn't touch).
    const patch: Record<string, any> = { ...dto };
    for (const field of SECRET_FIELDS) {
      if (patch[field] === undefined || patch[field] === '') {
        delete patch[field];
      }
    }
    Object.assign(config, patch);
    return this.configRepo.save(config);
  }

  async remove(agentKey: string): Promise<void> {
    const config = await this.findByKey(agentKey);
    await this.configRepo.remove(config);
  }

  /** Builds a URL-safe, unique agentKey from the business name (e.g. "Clínica Sol" -> "clinica-sol-3f9a"). */
  private async generateUniqueKey(businessName: string): Promise<string> {
    const base =
      businessName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip accents (combining marks U+0300–U+036F)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'agent';

    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const candidate = `${base}-${suffix}`;
      const exists = await this.configRepo.findOne({ where: { agentKey: candidate } });
      if (!exists) return candidate;
    }
    // Extremely unlikely fallback
    return `${base}-${Date.now().toString(36)}`;
  }
}
