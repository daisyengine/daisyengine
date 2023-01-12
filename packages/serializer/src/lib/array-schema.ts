import { ArrayChangeTree, ArrayChangeType } from './change-tree';
import { NumberRef } from './number-ref';
import { Schema } from './schema';
import {
  registeredSerializers,
  serializeUInt16,
  serializeUInt8,
} from './serializers';

export class ArraySchema<T extends Schema | string | number | boolean> {
  private _items: T[];
  private _internalChangeTree: ArrayChangeTree<T>;
  private _isDirty: boolean = false;

  /** @internal */
  _internalOnDirty?: () => void;

  public get length(): number {
    return this._items.length;
  }

  constructor() {
    this._items = [];
    this._internalChangeTree = new ArrayChangeTree<T>();
  }

  push(...items: T[]) {
    let index = -1;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];

      index = this._items.push(item) - 1;
      this._internalChangeTree.add(index, ArrayChangeType.Insert, item);

      if (item instanceof Schema) {
        // Changes to a child schema marks array schema dirty.
        item._internalOnDirty = () => {
          // Push to change tree
          this._internalChangeTree.add(index, ArrayChangeType.Update, item);

          // Mark us dirty if we are not already dirty
          this.markDirty();
        };
      }
    }
    this.markDirty();

    return index;
  }

  markDirty() {
    // Mark us dirty if we are not already dirty
    if (!this._isDirty) {
      this._isDirty = true;
      this._internalOnDirty?.call(undefined);
    }
  }

  get(index: number): T | undefined {
    return this._items[index];
  }

  pop(): T | undefined {
    const item = this._items.pop();
    if (item !== undefined) {
      // this._internalItems.length is the removed index since it is 1 higher
      // than the highest index in the array. (which would make it the item idx)
      this._internalChangeTree.add(this._items.length, ArrayChangeType.Delete);

      // Remove dirty callback of item if it is a schema
      if (item instanceof Schema) {
        (<Schema>item)._internalOnDirty = undefined;
      }
    }
    return item;
  }

  shift(): T | undefined {
    const item = this._items.shift();
    if (item !== undefined) {
      this._internalChangeTree.add(0, ArrayChangeType.Delete);

      // Remove dirty callback of item if it is a schema
      if (item instanceof Schema) {
        (<Schema>item)._internalOnDirty = undefined;
      }
    }
    return item;
  }

  toArray(): T[] {
    return Array.from(this._items);
  }

  join(separator?: string | undefined): string {
    return this._items.join(separator);
  }

  set(index: number, newValue: T) {
    if (this._items.length - 1 >= index) {
      // Remove dirty callback of old value if it is a schema
      if (this._items[index] instanceof Schema) {
        (<Schema>this._items[index])._internalOnDirty = undefined;
      }
      // Push to change tree
      this._internalChangeTree.add(index, ArrayChangeType.Update, newValue);
    } else
      this._internalChangeTree.add(index, ArrayChangeType.Insert, newValue);

    this._items[index] = newValue;
  }

  deleteAt(index: number): T[] {
    if (this._items.length - 1 >= index) {
      // Remove dirty callback of item if it is a schema
      if (this._items[index] instanceof Schema) {
        (<Schema>this._items[index])._internalOnDirty = undefined;
      }
      // Push to change tree
      this._internalChangeTree.add(index, ArrayChangeType.Delete);
      return this._items.splice(index, 1);
    }
    return [];
  }

  delete(item: T): T[] {
    const index = this._items.indexOf(item);
    if (index !== -1) {
      // Remove dirty callback of value if it is a schema
      if (item instanceof Schema) {
        (<Schema>item)._internalOnDirty = undefined;
      }
      // Push to change tree
      this._internalChangeTree.add(index, ArrayChangeType.Delete);
      return this._items.splice(index, 1);
    }
    return [];
  }

  _internalSerialize(
    buf: Buffer,
    ref: NumberRef,
    dataType: string,
    all: boolean = false
  ) {
    if (!all) {
      const changes = this._internalChangeTree.takeAll();

      serializeUInt16(changes.length, buf, ref);

      for (const change of changes) {
        serializeUInt16(change.index, buf, ref);
        serializeUInt8(change.type, buf, ref);

        switch (change.type) {
          case ArrayChangeType.Insert:
          case ArrayChangeType.Update:
            if (dataType === '$schema') {
              (<Schema>change.value)._internalSerialize(buf, ref);
            } else {
              const serializer = registeredSerializers.get(dataType);
              serializer?.[0](change.value, buf, ref);
            }
            break;
          case ArrayChangeType.Delete:
            break;
          default:
            break;
        }
      }

      // Set isDirty to false after every normal serialization
      this._isDirty = false;
    } else {
      serializeUInt16(this._items.length, buf, ref);

      for (let i = 0; i < this._items.length; i++) {
        const item = this._items[i];

        serializeUInt16(i, buf, ref);
        serializeUInt8(ArrayChangeType.Insert, buf, ref);

        if (dataType === '$schema') {
          (<Schema>item)._internalSerialize(buf, ref, true);
        } else {
          const serializer = registeredSerializers.get(dataType);
          serializer?.[0](item, buf, ref);
        }
      }
    }
  }
}
