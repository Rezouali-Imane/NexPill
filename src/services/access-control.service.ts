import { prisma } from "../db/prisma";
import { ForbiddenError } from "../errors";

export type AccessLevel = "read" | "write";

export class AccessControlService {
  /**
   * Asserts whether actorUserId has permission to access the patient's records.
   * Throws ForbiddenError if the actor is neither the patient, an authorized caregiver,
   * nor a platform admin.
   */
  static async assertPatientAccess(
    actorUserId: string,
    patientId: string,
    action: AccessLevel = "read",
  ): Promise<void> {
    // 1. Patient accessing their own records
    if (actorUserId === patientId) {
      return;
    }

    // 2. Check if actor is an admin
    const actorUser = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { platformRole: true },
    });

    if (actorUser?.platformRole === "ADMIN") {
      return;
    }

    // 3. Check caregiver access permissions
    const access = await prisma.caregiverAccess.findUnique({
      where: {
        caregiverId_patientId: {
          caregiverId: actorUserId,
          patientId,
        },
      },
    });

    if (!access || access.status !== "ACTIVE") {
      throw new ForbiddenError(
        "You do not have active caregiver access for this patient.",
      );
    }

    if (action === "read" && !access.canViewSchedule) {
      throw new ForbiddenError(
        "Your caregiver permissions do not allow viewing this patient's schedule and medications.",
      );
    }

    if (action === "write" && !access.canManageMedications) {
      throw new ForbiddenError(
        "Your caregiver permissions do not allow modifying or managing this patient's medications.",
      );
    }
  }
}
