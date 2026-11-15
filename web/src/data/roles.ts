import type { RoleType } from '@shared';

export interface RoleMeta {
  label: string;
  color: string;
}

export const ROLE_META: Record<RoleType, RoleMeta> = {
  lead_developer: { label: 'Lead developer', color: '#F0E442' },
  co_developer: { label: 'Co-development', color: '#E69F00' },
  port: { label: 'Port', color: '#56B4E9' },
  publisher: { label: 'Publisher', color: '#1DB88E' },
  localization: { label: 'Localization', color: '#CC79A7' },
  qa: { label: 'QA / LQA', color: '#F0703A' },
  art: { label: 'Art (outsourced)', color: '#6C8CFF' },
  audio: { label: 'Audio (outsourced)', color: '#6C8CFF' },
  support: { label: 'Other support', color: '#A0A7B4' },
};

export interface RoleGroup {
  id: string;
  label: string;
  color: string;
  roles: RoleType[];
}

export const ROLE_GROUPS: RoleGroup[] = [
  { id: 'lead_developer', label: 'Lead developer', color: '#F0E442', roles: ['lead_developer'] },
  { id: 'co_developer', label: 'Co-development', color: '#E69F00', roles: ['co_developer'] },
  { id: 'port', label: 'Port', color: '#56B4E9', roles: ['port'] },
  { id: 'publisher', label: 'Publisher', color: '#1DB88E', roles: ['publisher'] },
  { id: 'localization', label: 'Localization', color: '#CC79A7', roles: ['localization'] },
  { id: 'qa', label: 'QA / LQA', color: '#F0703A', roles: ['qa'] },
  { id: 'art_audio', label: 'Art / audio', color: '#6C8CFF', roles: ['art', 'audio'] },
  { id: 'support', label: 'Other support', color: '#A0A7B4', roles: ['support'] },
];
