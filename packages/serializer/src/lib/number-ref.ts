/**
 * An object that can hold a number.
 * Objects are passed as reference in JavaScript, and there is no other way to
 * get a reference to a primitive, so I use an object that holds a primitive.
 */
export interface NumberRef {
  value: number;
}
