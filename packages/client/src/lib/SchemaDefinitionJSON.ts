export interface SchemaDefinitionJSON {
  ids: { [key: string]: number };
  keys: { [key: number]: string };
  arraySchemaIds: number[];
  types: { [key: number]: string };
  childDefinitions: { [key: number]: SchemaDefinitionJSON };
}
