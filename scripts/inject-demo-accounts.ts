import { prisma } from '../src/db/prisma';
import { supabase } from '../src/config/supabase';
import crypto from 'node:crypto';

const DEMO_PASSWORD = 'Nexpill123!';

interface AccountSeed {
  email: string;
  firstName: string;
  lastName: string;
  role: 'patient' | 'caregiver';
}

const PATIENT_ACCOUNTS: AccountSeed[] = [
  { email: 'patient@nexpill.demo', firstName: 'Jamie', lastName: 'Miller', role: 'patient' },
  { email: 'patient@nexpill.com', firstName: 'Jamie', lastName: 'Miller', role: 'patient' },
  { email: 'jamie@nexpill.demo', firstName: 'Jamie', lastName: 'Miller', role: 'patient' },
];

const CAREGIVER_ACCOUNTS: AccountSeed[] = [
  { email: 'caregiver@nexpill.demo', firstName: 'Sarah', lastName: 'Miller', role: 'caregiver' },
  { email: 'caregiver@nexpill.com', firstName: 'Sarah', lastName: 'Miller', role: 'caregiver' },
  { email: 'emily@nexpill.demo', firstName: 'Emily', lastName: 'Miller', role: 'caregiver' },
];

async function ensureSupabaseUser(account: AccountSeed): Promise<string> {
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: account.email,
        password: DEMO_PASSWORD,
        options: {
          data: {
            firstName: account.firstName,
            lastName: account.lastName,
            role: account.role,
          },
        },
      });

      if (data?.user?.id) {
        console.log(`[Supabase] Registered auth user for ${account.email}: ${data.user.id}`);
        return data.user.id;
      }
      if (error) {
        console.log(`[Supabase Auth note for ${account.email}]: ${error.message}`);
      }
    } catch (e: any) {
      console.log(`[Supabase Error for ${account.email}]: ${e.message}`);
    }
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: account.email, mode: 'insensitive' } },
  });
  if (existing) return existing.id;

  return crypto.randomUUID();
}

async function seedData() {
  console.log('Seeding demo accounts into database...');

  // 1. Ensure Patient and Caregiver accounts
  const patientUserId = await ensureSupabaseUser(PATIENT_ACCOUNTS[0]);
  const caregiverUserId = await ensureSupabaseUser(CAREGIVER_ACCOUNTS[0]);

  // Upsert Patient User & Profile
  const patient = await prisma.user.upsert({
    where: { id: patientUserId },
    update: { email: PATIENT_ACCOUNTS[0].email, disabledAt: null },
    create: {
      id: patientUserId,
      email: PATIENT_ACCOUNTS[0].email,
      platformRole: 'USER',
      profile: {
        create: {
          displayName: `${PATIENT_ACCOUNTS[0].firstName} ${PATIENT_ACCOUNTS[0].lastName}`,
          timeZone: 'UTC',
        },
      },
    },
    include: { profile: true },
  });

  if (!patient.profile) {
    await prisma.userProfile.create({
      data: {
        userId: patient.id,
        displayName: `${PATIENT_ACCOUNTS[0].firstName} ${PATIENT_ACCOUNTS[0].lastName}`,
        timeZone: 'UTC',
      },
    });
  }

  // Upsert Caregiver User & Profile
  const caregiver = await prisma.user.upsert({
    where: { id: caregiverUserId },
    update: { email: CAREGIVER_ACCOUNTS[0].email, disabledAt: null },
    create: {
      id: caregiverUserId,
      email: CAREGIVER_ACCOUNTS[0].email,
      platformRole: 'USER',
      profile: {
        create: {
          displayName: `${CAREGIVER_ACCOUNTS[0].firstName} ${CAREGIVER_ACCOUNTS[0].lastName}`,
          timeZone: 'UTC',
        },
      },
    },
    include: { profile: true },
  });

  if (!caregiver.profile) {
    await prisma.userProfile.create({
      data: {
        userId: caregiver.id,
        displayName: `${CAREGIVER_ACCOUNTS[0].firstName} ${CAREGIVER_ACCOUNTS[0].lastName}`,
        timeZone: 'UTC',
      },
    });
  }

  // Upsert aliases so judges can use either .demo or .com
  for (const pAlias of PATIENT_ACCOUNTS.slice(1)) {
    const id = await ensureSupabaseUser(pAlias);
    await prisma.user.upsert({
      where: { id },
      update: { email: pAlias.email, disabledAt: null },
      create: {
        id,
        email: pAlias.email,
        platformRole: 'USER',
        profile: {
          create: { displayName: `${pAlias.firstName} ${pAlias.lastName}`, timeZone: 'UTC' },
        },
      },
    });
  }
  for (const cAlias of CAREGIVER_ACCOUNTS.slice(1)) {
    const id = await ensureSupabaseUser(cAlias);
    await prisma.user.upsert({
      where: { id },
      update: { email: cAlias.email, disabledAt: null },
      create: {
        id,
        email: cAlias.email,
        platformRole: 'USER',
        profile: {
          create: { displayName: `${cAlias.firstName} ${cAlias.lastName}`, timeZone: 'UTC' },
        },
      },
    });
  }

  console.log(`Patient: ${patient.email} (${patient.id})`);
  console.log(`Caregiver: ${caregiver.email} (${caregiver.id})`);

  // 2. Link Caregiver to Patient
  const existingAccess = await prisma.caregiverAccess.findFirst({
    where: {
      patientId: patient.id,
      caregiverId: caregiver.id,
    },
  });

  if (!existingAccess) {
    await prisma.caregiverAccess.create({
      data: {
        patientId: patient.id,
        caregiverId: caregiver.id,
        requestedById: patient.id,
        status: 'ACTIVE',
        canViewSchedule: true,
        canViewHistory: true,
        canReceiveAlerts: true,
        canRecordDoses: true,
        canManageMedications: true,
        grantedAt: new Date(),
      },
    });
    console.log('Linked Caregiver to Patient with full permissions.');
  } else {
    await prisma.caregiverAccess.update({
      where: { id: existingAccess.id },
      data: {
        status: 'ACTIVE',
        canViewSchedule: true,
        canViewHistory: true,
        canReceiveAlerts: true,
        canRecordDoses: true,
        canManageMedications: true,
        grantedAt: new Date(),
      },
    });
    console.log('Updated Caregiver access link to ACTIVE.');
  }

  // Also link aliases to patient
  for (const cAlias of CAREGIVER_ACCOUNTS.slice(1)) {
    const aliasUser = await prisma.user.findFirst({ where: { email: { equals: cAlias.email, mode: 'insensitive' } } });
    if (aliasUser) {
      const ex = await prisma.caregiverAccess.findFirst({ where: { patientId: patient.id, caregiverId: aliasUser.id } });
      if (!ex) {
        await prisma.caregiverAccess.create({
          data: {
            patientId: patient.id,
            caregiverId: aliasUser.id,
            requestedById: patient.id,
            status: 'ACTIVE',
            canViewSchedule: true,
            canViewHistory: true,
            canReceiveAlerts: true,
            canRecordDoses: true,
            canManageMedications: true,
            grantedAt: new Date(),
          },
        });
      }
    }
  }

  // 3. Clear existing medications/schedules for a clean demo state
  const oldMeds = await prisma.medication.findMany({
    where: { patientId: patient.id },
    select: { id: true },
  });

  for (const m of oldMeds) {
    const scheds = await prisma.medicationSchedule.findMany({ where: { medicationId: m.id }, select: { id: true } });
    for (const s of scheds) {
      await prisma.doseEvent.deleteMany({ where: { dose: { scheduleId: s.id } } });
      await prisma.caregiverAlert.deleteMany({ where: { dose: { scheduleId: s.id } } });
      await prisma.scheduledDose.deleteMany({ where: { scheduleId: s.id } });
      await prisma.medicationSchedule.delete({ where: { id: s.id } });
    }
    await prisma.safetyWarning.deleteMany({ where: { medicationId: m.id } });
    await prisma.medication.delete({ where: { id: m.id } });
  }

  // 4. Create 3 realistic medications with schedules & doses
  const medConfigs = [
    {
      name: 'Metformin',
      dosageText: '500 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet with breakfast',
      prescriber: 'Dr. Sarah Chen',
      time: '08:00',
    },
    {
      name: 'Lisinopril',
      dosageText: '10 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet with a full glass of water',
      prescriber: 'Dr. Sarah Chen',
      time: '12:30',
    },
    {
      name: 'Atorvastatin',
      dosageText: '20 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet at bedtime',
      prescriber: 'Dr. Sarah Chen',
      time: '20:00',
    },
  ];

  const now = new Date();

  for (const cfg of medConfigs) {
    const med = await prisma.medication.create({
      data: {
        patientId: patient.id,
        name: cfg.name,
        dosageText: cfg.dosageText,
        form: cfg.form,
        instructions: cfg.instructions,
        prescriber: cfg.prescriber,
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      },
    });

    const sched = await prisma.medicationSchedule.create({
      data: {
        medicationId: med.id,
        doseLabel: cfg.dosageText,
        timeZone: 'UTC',
        timesOfDay: [cfg.time],
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        effectiveFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Generate doses for past 7 days, today, and tomorrow
    for (let dayOffset = -7; dayOffset <= 1; dayOffset++) {
      const d = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const [hourStr, minStr] = cfg.time.split(':');
      const scheduledAt = new Date(`${dateStr}T${hourStr}:${minStr}:00.000Z`);

      let status: 'TAKEN' | 'PENDING' | 'SKIPPED' | 'MISSED' = 'PENDING';
      let resolvedAt: Date | null = null;

      if (dayOffset < 0) {
        if (dayOffset === -3 && cfg.name === 'Lisinopril') {
          status = 'SKIPPED';
          resolvedAt = new Date(scheduledAt.getTime() + 25 * 60 * 1000);
        } else {
          status = 'TAKEN';
          resolvedAt = new Date(scheduledAt.getTime() + 10 * 60 * 1000);
        }
      } else if (dayOffset === 0) {
        if (cfg.time === '08:00') {
          status = 'TAKEN';
          resolvedAt = new Date(scheduledAt.getTime() + 8 * 60 * 1000);
        } else {
          status = 'PENDING';
        }
      } else {
        status = 'PENDING';
      }

      const dose = await prisma.scheduledDose.create({
        data: {
          scheduleId: sched.id,
          patientId: patient.id,
          scheduledAt,
          localDate: new Date(`${dateStr}T00:00:00.000Z`),
          timeZone: 'UTC',
          lateAfterAt: new Date(scheduledAt.getTime() + 15 * 60 * 1000),
          missedDeadlineAt: new Date(scheduledAt.getTime() + 120 * 60 * 1000),
          status,
          resolvedAt,
          resolvedSource: status === 'TAKEN' || status === 'SKIPPED' ? 'PATIENT' : null,
        },
      });

      if (status === 'TAKEN' || status === 'SKIPPED') {
        await prisma.doseEvent.create({
          data: {
            doseId: dose.id,
            fromStatus: 'PENDING',
            toStatus: status,
            source: 'PATIENT',
            actorUserId: patient.id,
            occurredAt: resolvedAt!,
            idempotencyKey: `seed-event-${dose.id}`,
          },
        });
      }
    }

    console.log(`Created medication ${cfg.name} with schedule & doses.`);
  }

  // 5. Create a sample caregiver alert
  await prisma.caregiverAlert.create({
    data: {
      patientId: patient.id,
      recipientId: caregiver.id,
      type: 'DOSE_LATE',
      status: 'RESOLVED',
      message: 'Lisinopril scheduled for 12:30 was confirmed late by Jamie.',
      reason: { delayMinutes: 25, doseName: 'Lisinopril 10 mg' },
      dedupeKey: `demo-alert-${patient.id}-1`,
      resolvedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    },
  });

  console.log('\n=======================================');
  console.log('DEMO DATA INJECTION SUCCESSFULLY COMPLETE!');
  console.log('PATIENT ACCOUNT:');
  console.log(`  Email:    ${PATIENT_ACCOUNTS[0].email} (also ${PATIENT_ACCOUNTS[1].email})`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Name:     ${PATIENT_ACCOUNTS[0].firstName} ${PATIENT_ACCOUNTS[0].lastName}`);
  console.log('\nCAREGIVER ACCOUNT:');
  console.log(`  Email:    ${CAREGIVER_ACCOUNTS[0].email} (also ${CAREGIVER_ACCOUNTS[1].email})`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Name:     ${CAREGIVER_ACCOUNTS[0].firstName} ${CAREGIVER_ACCOUNTS[0].lastName}`);
  console.log('=======================================\n');
}

seedData()
  .catch((e) => {
    console.error('Error seeding demo accounts:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
