import {
  Bool,
  Circuit,
  Field
} from 'snarkyjs';

export function fieldLog2LowerLimit(number: Field): Field {
  number.assertGt(0);

  const bits: Bool[] = number.toBits();
  const isPowerOfTwo: Bool = Circuit.if(
    Bool.or(number.equals(1), bits.reduce((sum, each) => Circuit.if(each, sum.add(Field(1)), sum.add(Field(0))), Field(0)).gt(Field(1))),
    Bool(false),
    Bool(true)
  );

  return Circuit.if(
    isPowerOfTwo,
    Field(bits.map(each => each.toBoolean()).lastIndexOf(true)),
    Field(bits.map(each => each.toBoolean()).lastIndexOf(true)).add(1)
  );
};
