import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';
import { AppointmentStatus } from '../common/entities/appointment.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('serviceId') serviceId?: string,
    @Query('calendarId') calendarId?: string,
    @Query('status') status?: AppointmentStatus,
  ) {
    return this.appointmentsService.findAll(from, to, {
      serviceId,
      calendarId,
      status,
    });
  }

  // Static routes MUST be declared before the `:id` param route.
  @Get('today')
  findToday() {
    return this.appointmentsService.findToday();
  }

  @Get('pending')
  findPending() {
    return this.appointmentsService.findAll(undefined, undefined, {
      status: AppointmentStatus.PENDING_APPROVAL,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.appointmentsService.accept(id, user.name || user.email || user.id);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body('reason') reason?: string,
  ) {
    return this.appointmentsService.reject(id, user.name || user.email || user.id, reason);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  // DELETE = logical cancellation (preserves history), not a hard delete.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.appointmentsService.cancel(id, user.id);
  }
}
