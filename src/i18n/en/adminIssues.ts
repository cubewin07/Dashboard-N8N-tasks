import type { adminIssues as vi } from '../vi/adminIssues'

export const adminIssues: typeof vi = {
  codes: {
    schema: 'The data is not in the expected shape ({message}).',
    duplicate: 'The code “{value}” is used twice ({owner}). Each code can be used once per list.',
    badKey:
      'The code “{value}” ({owner}) is not valid: use lowercase letters without accents, digits and underscores, starting with a letter.',
    badId: 'The identifier “{value}” ({owner}) is not valid: it must start with “{prefix}_”.',
    refDepartment: '{owner} uses the department “{value}”, which does not exist.',
    refRole: '{owner} uses the role “{value}”, which does not exist.',
    refSpecialty: '{owner} uses the specialty “{value}”, which does not exist.',
    refPlatform: '{owner} uses the platform “{value}”, which does not exist.',
    refTaskType: '{owner} uses the task type “{value}”, which does not exist.',
    deptRequired: '{owner} holds the {role} role, so they must belong to a department.',
    deptForbidden:
      '{owner} holds the {role} role (building-wide), so they cannot belong to a department.',
    managerMissing:
      'Exactly one active person must run the whole building (the manager), and there is none.',
    managerMultiple:
      'Only one active person may run the whole building, but there are {count}: {names}.',
    humanOwnerMissing:
      'At least one active owner (a real person) is needed to approve important work.',
    roleOverLimit: 'Department {department} has {count} people in the {role} role (maximum {max}).',
    deptNoManager:
      'Department {department} has no Department Manager: work needing approval will go to the next level up.',
    deptNoLead:
      'Department {department} has no Team Lead to hand out reviews: work needing approval will go to the next level up.',
    deptNoReviewer:
      'Department {department} has no Reviewer: work needing approval will go to the next level up.',
    refInactiveDepartment: '{owner} mentions the department {name}, which is switched off.',
    refInactivePlatform: '{owner} mentions the platform {name}, which is switched off.',
    employeeInInactiveDepartment:
      '{employee} works in department {department}, which is switched off.',
    approverMissingReviewer:
      'The policy or a rule asks for Reviewer-level approval, but no role can approve at that level.',
    approverMissingDeptManager:
      'The policy or a rule asks for Department Manager approval, but no role can approve at that level.',
    approverMissingBoss:
      'The policy or a rule asks for the Boss to approve, but no owner is active.',
    policyTempCap: 'The temp staff cap must be between {min} and {max} (now {value}).',
    policyHelpRounds: 'Help rounds must be between {min} and {max} (now {value}).',
    policyHelpTimeout: 'The help timeout must be between {min} and {max} minutes (now {value}).',
    policyWeights:
      'Priority weights must decrease: Urgent > High > Normal > Low (now {urgent} / {high} / {normal} / {low}).',
    policyAgingCap:
      'The waiting bonus must be below {limit} (the gap between High and Low) so a Low item never passes a High one (now {value}).',
    policyQuestionSeat:
      'The question seating threshold must be between {min} and {max} (now {value}).',
    bossInStack:
      'The boss floor is always added automatically on top and must not be part of the building stack.',
  },
}
