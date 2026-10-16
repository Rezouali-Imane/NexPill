import { prisma } from "../db/prisma";
import { ForbiddenError } from "../errors";

export type AccessLevel = "read" | "write" | "record_dose";

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
    const actorUser = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { platformRole: true, disabledAt: true },
    });

    if (!actorUser || actorUser.disabledAt) {
      throw new ForbiddenError("Your account is not allowed to access application data.");
    }

    if (actorUserId === patientId) {
      return;
    }

    // Platform admins can access patient records without caregiver access.
    if (actorUser.platformRole === "ADMIN") {
      return;
    }

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

    if (action === "record_dose" && !access.canRecordDoses) {
      throw new ForbiddenError(
        "Your caregiver permissions do not allow recording doses for this patient.",
      );
    }
  }
}
