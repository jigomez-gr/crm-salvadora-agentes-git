import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contact } from './contact.entity';

export enum AppointmentStatus {
  PENDING_APPROVAL = 'pending_approval',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('appointments')
// Calendar range queries filter by date; the dashboard counts by (status, date).
@Index(['status', 'startsAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  contactId: string;

  @ManyToOne(() => Contact, (contact) => contact.appointments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  service: string;

  @Index()
  @Column({ nullable: true })
  serviceId: string | null;

  @Index()
  @Column({ default: 'default' })
  calendarId: string;

  @Index()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  // Which agent booked it (WhatsApp). Null for manual/calendar bookings.
  @Column({ nullable: true })
  agentKey: string | null;

  // Optional internal notes about the appointment.
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Optional price (for future invoicing/deposits). Stored as numeric.
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  // ─── Acceptance audit (set when status becomes 'scheduled' from 'pending_approval') ───
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ nullable: true })
  acceptedBy: string | null;

  // ─── Cancellation audit (set when status becomes 'cancelled') ───
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  // Who cancelled: a user id, or 'agent' / 'customer' / 'system'.
  @Column({ nullable: true })
  cancelledBy: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
