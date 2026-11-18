// Waggle → CRM (GoHighLevel): the contract and the queue. Sending lives in features/crm.
// Start with features/crm/README.md.
export {
  CRM_EVENTS,
  CRM_FIELDS,
  CRM_INACTIVE_AFTER_DAYS,
  CRM_MIN_GAP_MS,
  CRM_TRIGGER_TAG,
  isCrmEvent,
} from "./catalog";
export type { CrmEvent, CrmField } from "./catalog";
export { lifecycleEvents } from "./lifecycle";
export type { BillState, LifecycleEvent } from "./lifecycle";
export {
  organizationHasPaid,
  organizationOwners,
  queueCrmEvent,
  queueForOwners,
  queueQuietly,
} from "./queue";
export type { QueuedCrmEvent } from "./queue";
