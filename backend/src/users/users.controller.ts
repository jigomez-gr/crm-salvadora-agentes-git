import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/entities/user.entity';
import { AUDIT_EVENT, AuditAction, AuditRecord } from '../audit/audit.types';

/**
 * User management — ADMIN only. Guarded twice over: the user must be
 * authenticated (JwtAuthGuard) AND be an admin (RolesGuard + @Roles).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const user = await this.usersService.create(dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.USER_CREATE,
      summary: `Creó el usuario ${user.email} (${user.role})`,
      targetType: 'user',
      targetId: user.id,
      ip,
    });
    return user;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    // Pass the acting admin so a self-edit isn't flagged mustChangePassword
    // while resetting another user's password is.
    const user = await this.usersService.update(id, dto, actor.id);
    const changed = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    const notes: string[] = [];
    if (dto.password) notes.push('restableció la contraseña');
    if (dto.role !== undefined) notes.push(`rol → ${dto.role}`);
    if (dto.isActive === false) notes.push('desactivó la cuenta');
    if (dto.isActive === true) notes.push('activó la cuenta');
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.USER_UPDATE,
      summary:
        `Actualizó el usuario ${user.email}` +
        (notes.length ? ` (${notes.join(', ')})` : ''),
      targetType: 'user',
      targetId: user.id,
      ip,
      metadata: { changed },
    });
    return user;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const { email } = await this.usersService.remove(id, actor.id);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.USER_DELETE,
      summary: `Eliminó el usuario ${email}`,
      targetType: 'user',
      targetId: id,
      ip,
    });
  }
}
