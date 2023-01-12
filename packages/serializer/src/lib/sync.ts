import { Schema } from './schema';
import { registeredSerializers } from './serializers';
import { SchemaData } from './schema-data';

const dataMap = new Map<Function, SchemaData>();

function getSchemaData(k: Function) {
  if (!dataMap.has(k)) {
    dataMap.set(k, {
      lastPropId: 0,
      ids: new Map(),
      types: new Map(),
      keys: new Map(),
      arraySchemaIds: new Set(),
      schemaTypes: new Map(),
    });
  }
  return <SchemaData>dataMap.get(k);
}

/**
 * Makes a Schema field networked
 * @param type Type of this field
 */
export function sync<T extends Schema>(
  type: string | typeof Schema | [typeof Schema] | [string]
) {
  if (typeof type === 'string') {
    if (!registeredSerializers.has(type))
      throw new Error(`No serializer for custom type ${type} was found`);
  }

  return (target: T, key: string): void => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(target, key);

    if (originalDescriptor !== undefined) {
      throw new Error('@sync fields can not have descriptors!');
    }

    let data: SchemaData;
    let propId: number;

    data = getSchemaData(target.constructor);
    propId = data.lastPropId++;

    data.ids.set(key, propId);
    data.keys.set(propId, key);

    if (type instanceof Array) {
      console.log('ArraySchema:', type);

      data.arraySchemaIds.add(propId);

      if (type[0].constructor === Schema.constructor) {
        //console.log(' - Schema inside Array:', type[0]);
        data.schemaTypes.set(propId, <typeof Schema>type[0]);
        data.types.set(propId, '$schema');
      } else {
        //console.log(' - Custom inside array:', type[0]);
        data.types.set(propId, <string>type[0]);
      }
    } else if (type.constructor === Schema.constructor) {
      //console.log('typeof Schema:', type);
      data.schemaTypes.set(propId, <typeof Schema>type);

      data.types.set(propId, '$schema');
    } else {
      //console.log('custom:', type);

      data.types.set(propId, <string>type);
    }

    if (!target.constructor.hasOwnProperty('__data')) {
      Object.defineProperty(target.constructor, '__data', {
        get() {
          return data;
        },
      });
    }

    // Wrap hook methods
    Object.defineProperty(target, key, {
      set(value) {
        const instance = this as Schema;
        const previousValue = instance._internalValues.get(propId);

        // Child Schema of Schema
        if (type.constructor === Schema.constructor) {
          // Mark this schema dirty when child schema is dirty
          value._internalOnDirty = () => {
            // Push to change tree
            instance._internalChangeTree.add(propId, previousValue, value);

            // Mark this schema dirty if it isn't dirty
            instance.markDirty();
          };
        }
        // Child ArraySchema of Schema
        else if (type instanceof Array) {
          // Mark this schema dirty when ArraySchema is dirty
          value._internalOnDirty = () => {
            // Push to change tree
            instance._internalChangeTree.add(propId, previousValue, value);

            // Mark this schema dirty if it isn't dirty
            instance.markDirty();
          };
        }

        if (previousValue === value) {
          // Same value, ignore change
          return;
        }

        // Set new value
        instance._internalValues.set(propId, value);

        // Push to change tree
        instance._internalChangeTree.add(propId, previousValue, value);

        // Mark this schema dirty if it isn't dirty
        instance.markDirty();
      },
      get() {
        const instance = this as Schema;
        return instance._internalValues.get(propId);
      },
    });
  };
}
