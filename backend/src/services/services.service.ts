import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Service } from '../common/entities/service.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findManagers(): Promise<User[]> {
    return this.userRepo.find({
      where: {
        role: In([UserRole.SERVICE_MANAGER, UserRole.ADMIN]),
        isActive: true,
      },
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
    });
  }

  async findAll(activeOnly = false): Promise<Service[]> {
    const qb = this.serviceRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.manager', 'manager')
      .orderBy('s.name', 'ASC');

    if (activeOnly) {
      qb.where('s.isActive = :active', { active: true });
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.serviceRepo.findOne({
      where: { id },
      relations: ['manager'],
    });
    if (!service) {
      throw new NotFoundException(`Servicio ${id} no encontrado`);
    }
    return service;
  }

  async findByName(name: string): Promise<Service | null> {
    return this.serviceRepo.findOne({
      where: { name },
      relations: ['manager'],
    });
  }

  async create(dto: CreateServiceDto): Promise<Service> {
    const existing = await this.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Ya existe un servicio con el nombre "${dto.name}"`);
    }

    const generatedCalendarId = `cal-${dto.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const service = this.serviceRepo.create({
      ...dto,
      calendarId: dto.calendarId || generatedCalendarId,
      price: dto.price !== undefined ? (dto.price === '' ? null : dto.price) : null,
    });

    return this.serviceRepo.save(service);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findOne(id);

    if (dto.name && dto.name !== service.name) {
      const existing = await this.findByName(dto.name);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe un servicio con el nombre "${dto.name}"`);
      }
      service.name = dto.name;
    }

    if (dto.description !== undefined) service.description = dto.description;
    if (dto.durationMinutes !== undefined) service.durationMinutes = dto.durationMinutes;
    if (dto.price !== undefined) service.price = dto.price === '' ? null : dto.price;
    if (dto.calendarId !== undefined) service.calendarId = dto.calendarId;
    if (dto.managerId !== undefined) service.managerId = dto.managerId || null;
    if (dto.requiresApproval !== undefined) service.requiresApproval = dto.requiresApproval;
    if (dto.isActive !== undefined) service.isActive = dto.isActive;

    return this.serviceRepo.save(service);
  }

  async remove(id: string): Promise<void> {
    const service = await this.findOne(id);
    // Soft-deactivate or delete
    service.isActive = false;
    await this.serviceRepo.save(service);
  }
}