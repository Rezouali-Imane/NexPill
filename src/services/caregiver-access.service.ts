import crypto from "node:crypto";
import { prisma } from "../db/prisma";
import { BadRequestError, NotFoundError } from "../errors";
import { AccessControlService } from "./access-control.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CaregiverInvitePermissions {
  canViewSchedule?: boolean;
  canViewHistory?: boolean;
  canReceiveAlerts?: boolean;
  canRecordDoses?: boolean;
  canManageMedications?: boolean;
}

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

const ensureUser = async (userId: string, email: string) =>
  prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email },
    update: { email },
  });

export class CaregiverAccessService {
  static async createInvite(
    patientId: string,
    permissions: CaregiverInvitePermissions = {},
  ) {
    await AccessControlService.assertPatientAccess(patientId, patientId, "read");

    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(8);
    const token = "NX-" + Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const access = await prisma.$transaction(async (tx) => {
      const created = await tx.caregiverAccess.create({
        data: {
          patientId,
          requestedById: patientId,
          status: "PENDING",
          inviteTokenHash: hashToken(token),
          inviteExpiresAt,
          canViewSchedule: permissions.canViewSchedule ?? true,
          canViewHistory: permissions.canViewHistory ?? true,
          canReceiveAlerts: permissions.canReceiveAlerts ?? true,
          canRecordDoses: permissions.canRecordDoses ?? false,
          canManageMedications: permissions.canManageMedications ?? false,
        },
        select: { id: true, inviteExpiresAt: true },
      });

      await tx.auditEvent.create({
        data: {
          actorType: "USER",
          actorId: patientId,
          patientId,
          action: "CAREGIVER_INVITE_CREATED",
          resourceType: "CaregiverAccess",
          resourceId: created.id,
          metadata: { expiresAt: inviteExpiresAt.toISOString() },
        },
      });

      return created;
    });

    return { ...access, token };
  }

  static async acceptInvite(
    caregiverId: string,
    caregiverEmail: string,
    token: string,
  ) {
    const cleanToken = token.trim().toUpperCase();
    const tokenWithPrefix = cleanToken.startsWith("NX-") ? cleanToken : "NX-" + cleanToken;
    const tokenWithoutPrefix = cleanToken.replace(/^NX-/, "");
    const hashes = [
      hashToken(token),
      hashToken(cleanToken),
      hashToken(tokenWithPrefix),
      hashToken(tokenWithoutPrefix),
    ];
    const now = new Date();
    const invite = await prisma.caregiverAccess.findFirst({
      where: {
        inviteTokenHash: { in: hashes },
        status: "PENDING",
        inviteExpiresAt: { gt: now },
      },
    });

    if (!invite) {
      throw new NotFoundError("Invitation not found or expired.");
    }
    if (invite.patientId === caregiverId) {
      throw new BadRequestError("A patient cannot accept an invitation to themselves.");
    }

    const existing = await prisma.caregiverAccess.findUnique({
      where: {
        caregiverId_patientId: {
          caregiverId,
          patientId: invite.patientId,
        },
      },
    });
    if (existing && existing.id !== invite.id) {
      throw new BadRequestError("Caregiver access already exists for this patient.");
    }

    const accepted = await prisma.$transaction(async (tx) => {
      await ensureUser(caregiverId, caregiverEmail);
      const claimed = await tx.caregiverAccess.updateMany({
        data: {},
        where: {
          id: invite.id,
          status: "PENDING",
          inviteTokenHash: tokenHash,
          inviteExpiresAt: { gt: now },
        },
      });
      if (claimed.count !== 1) {
        throw new NotFoundError("Invitation not found or expired.");
      }
      const updated = await tx.caregiverAccess.update({
        where: { id: invite.id },
        data: {
          caregiverId,
          status: "ACTIVE",
          grantedAt: now,
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorType: "USER",
          actorId: caregiverId,
          patientId: invite.patientId,
          action: "CAREGIVER_INVITE_ACCEPTED",
          resourceType: "CaregiverAccess",
          resourceId: invite.id,
          metadata: { caregiverId },
        },
      });
      return updated;
    });

    return accepted;
  }

  static async listForUser(userId: string) {
    return prisma.caregiverAccess.findMany({
      where: {
        OR: [{ patientId: userId }, { caregiverId: userId }],
      },
      select: {
        id: true,
        patientId: true,
        caregiverId: true,
        status: true,
        canViewSchedule: true,
        canViewHistory: true,
        canReceiveAlerts: true,
        canRecordDoses: true,
        canManageMedications: true,
        grantedAt: true,
        createdAt: true,
      },
    });
  }
}
