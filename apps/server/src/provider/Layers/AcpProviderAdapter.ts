/**
 * Shared ACP provider-adapter factory.
 *
 * The implementation currently lives beside Cursor's extension handlers so
 * Cursor and standards-only ACP drivers share one session lifecycle. New ACP
 * drivers should import this module rather than depending on Cursor directly.
 */
export {
  makeAcpProviderAdapter,
  type AcpProviderAdapterDefinition,
  type AcpProviderAdapterOptions,
} from "./CursorAdapter.ts";
