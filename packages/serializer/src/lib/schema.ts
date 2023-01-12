import { ChangeTree } from './change-tree';
import { ArraySchema, registeredSerializers, SchemaData } from '.';
import { NumberRef } from './number-ref';

/**
 * A class that should hold room state.
 */
export class Schema {
  /** @internal */
  _internalValues: Map<number, any> = new Map();
  /** @internal */
  _internalDirtyProps = new Set<number>();
  /** @internal */
  _internalChangeTree = new ChangeTree();
  /** @internal */
  _internalOnDirty?: () => void;
  /** @internal */
  _internalIsDirty: boolean = false;

  /**
   * Marks this schema for serialization
   */
  markDirty() {
    // Mark us dirty if we are not already dirty
    if (!this._internalIsDirty) {
      this._internalIsDirty = true;
      this._internalOnDirty?.call(undefined);
    }
  }

  /**
   * Serializes this schema and all its dirty children
   * @internal
   */
  _internalSerialize(buf: Buffer, ref: NumberRef, all: boolean = false) {
    const data = <SchemaData>(this.constructor as any).__data;
    if (!all) {
      // Only serialize values that changed
      const changes = this._internalChangeTree.takeAll();

      // Number of changes
      buf.writeUInt8(changes.length, ref.value);
      ref.value += 1;

      for (const change of changes) {
        // Changed prop id
        buf.writeUInt8(change.propId, ref.value);
        ref.value += 1;

        // Get prop type
        const type = <string>data.types.get(change.propId);

        if (data.arraySchemaIds.has(change.propId)) {
          // Change is made to an ArraySchema: Call its own serialize method
          (<ArraySchema<any>>change.newValue)._internalSerialize(
            buf,
            ref,
            type
          );
        } else {
          if (type === '$schema') {
            // Change is made to a Schema: Call its own serialize method
            (<Schema>change.newValue)._internalSerialize(buf, ref);
          } else {
            // Change is made to a primitive type
            const serializer = registeredSerializers.get(type);
            serializer?.[0](change.newValue, buf, ref);
          }
        }
      }
      // Set isDirty to false after every normal serialization
      this._internalIsDirty = false;
    } else {
      // Serialize everything
      buf.writeUInt8(this._internalValues.size, ref.value);
      ref.value += 1;

      for (const [propId, value] of this._internalValues) {
        // Changed prop id
        buf.writeUInt8(propId, ref.value);
        ref.value += 1;

        // Get prop type
        const type = <string>data.types.get(propId);

        if (data.arraySchemaIds.has(propId)) {
          // Change is made to an ArraySchema: Call its own serialize method
          (<ArraySchema<any>>value)._internalSerialize(buf, ref, type, true);
        } else {
          if (type === '$schema') {
            // Change is made to a Schema: Call its own serialize method
            value._internalSerialize(buf, ref, true);
          } else {
            // Change is made to a primitive type
            const serializer = registeredSerializers.get(type);
            serializer?.[0](value, buf, ref);
          }
        }
      }
    }
  }
}
