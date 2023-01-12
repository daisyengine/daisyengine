export interface Change<T> {
  propId: number;
  oldValue: T;
  newValue: T;
}

/**
 * A very simple tree of changes
 */
export class ChangeTree<T> {
  private _changes: Change<T>[] = [];

  add(propId: number, oldValue: T, newValue: T) {
    const change: Change<T> = { propId, oldValue, newValue };
    this._changes.push(change);
  }

  takeAll() {
    const changes = this._changes;
    this._changes = [];
    return changes;
  }

  size() {
    return this._changes.length;
  }
}

export enum ArrayChangeType {
  Insert,
  Update,
  Delete,
}

export interface ArrayChange<T> {
  index: number;
  type: ArrayChangeType;

  value?: T;
}

/**
 * A very simple tree of changes in an ArraySchema
 */
export class ArrayChangeTree<T> {
  private _changes: ArrayChange<T>[] = [];

  add(index: number, type: ArrayChangeType, value?: T) {
    const change: ArrayChange<T> = { index, type, value: value };
    this._changes.push(change);
  }

  takeAll() {
    const changes = this._changes;
    this._changes = [];
    return changes;
  }

  size() {
    return this._changes.length;
  }
}
