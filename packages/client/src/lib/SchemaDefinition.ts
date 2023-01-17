export interface SchemaDefinition {
  ids: Map<string, number>;
  types: Map<number, string>;
  arraySchemaIds: Set<number>;
  keys: Map<number, string>;
  childDefinitions: Map<number, SchemaDefinition>;
}
