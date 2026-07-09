/**
 * registerUi — the Register mode's shell-owned UI state.
 *
 * PORTED from genoly-family-web src/lib/explorer/registerUi.ts (2026-07-09),
 * adapted for mobile: the web's grid/table `layout` toggle (and its
 * localStorage persistence) is dropped — the mobile Register is TABLE-ONLY by
 * design, and React Native has no `window.localStorage`.
 *
 * The Register's search / filters / sort live in the tree shell (the Tree tab)
 * so they survive mode switches; RegisterTable renders them as controlled
 * props.
 */

import { DEFAULT_FILTERS, type ListFilters, type SortKey } from './listHelpers';

export const REGISTER_PAGE_SIZE = 50;

/** The Register's UI state, owned by the tree shell so it survives mode switches. */
export interface RegisterUiState {
  searchQuery: string;
  filters: ListFilters;
  sortKey: SortKey;
  pageSize: number;
}

export const DEFAULT_REGISTER_UI: RegisterUiState = {
  searchQuery: '',
  filters: DEFAULT_FILTERS,
  sortKey: 'relationship',
  pageSize: REGISTER_PAGE_SIZE,
};

export function initialRegisterUi(): RegisterUiState {
  return { ...DEFAULT_REGISTER_UI };
}
