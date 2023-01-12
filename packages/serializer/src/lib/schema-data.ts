import { Schema } from './schema';

/**
 * Holds stuff important for serialization of a Schema.
 * @internal
 */
export interface SchemaData {
  /** @internal */
  lastPropId: number;
  /** @internal */
  ids: Map<string, number>;
  /** @internal */
  types: Map<number, string>;
  /** @internal */
  arraySchemaIds: Set<number>;
  /** @internal */
  keys: Map<number, string>;
  /** @internal */
  schemaTypes: Map<number, typeof Schema>;
}
