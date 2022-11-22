import {
  Field,
  // Experimental,
  MerkleTree,
} from 'snarkyjs';

export class MerkleTreeClass<
  Node extends {
    getHash(): Field;
  }
> extends Map<bigint, Node> {
  private tree;

  constructor(public readonly height: number) {
    super();
    this.tree = new MerkleTree(height);
  }

  // setAll(key: bigint, value: Node) {
  //   super.set(key, value);
  //   this.tree.setLeaf(key, value.getHash());
  //   this.setAll(key.sub(1), value);
  // }

  set(key: bigint, value: Node): this {
    super.set(key, value);
    this.tree.setLeaf(key, value.getHash());
    return this;
  }

  get(key: bigint): Node | undefined {
    return super.get(key);
  }

  getWitness(key: bigint): { isLeft: boolean; sibling: Field }[] {
    return this.tree.getWitness(key);
  }

  getRoot(): Field {
    return this.tree.getRoot();
  }
}
