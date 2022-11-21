import {
  isReady,
  Mina,
  shutdown,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  MerkleTree,
  MerkleWitness,
  Field,
  Bool
} from 'snarkyjs';
import { Vote, Voter, Candidate, MerkleWitnessClass } from './Vote';

const MAX_MERKLE_TREE_HEIGHT = 32;

let testAccounts: {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}[];
let voters: Field[]; // Offchain storage to test
let candidates: Field[]; // Offchain storage to test
let electionProps: {
  startTime: UInt64,
  endTime: UInt64,
  candidateCount: Field
}; // Initilization conditions, not stored anywhere normally

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  testAccounts = Local.testAccounts;
  return Local.testAccounts[0].privateKey;
}

describe('Vote', () => {
  let deployerAccount: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkAppInstance: Vote;

  beforeAll(async () => {
    await isReady;
    deployerAccount = createLocalBlockchain();
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkAppInstance = new Vote(zkAppAddress);
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkAppInstance.deploy({ zkappKey: zkAppPrivateKey });

      voters = testAccounts.filter((_, i) => i > 0 && i < 4).map(each => (new Voter(each.publicKey, Bool(false)).hash()));

      const tree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
      candidates = Array.from({ length: 5 }, (_, i) => (new Candidate(Field(i), Field(0), new MerkleWitnessClass(tree.getWitness(BigInt(i))))).hash());

      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
  });

  afterAll(async () => {
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Vote` smart contract with election params', async () => {
    electionProps = {
      startTime: UInt64.from((new Date()).getTime()),
      endTime: UInt64.from((new Date()).getTime() + (3 * 60 * 60 * 1000)),
      candidateCount: Field(5)
    };

    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.start(
        electionProps.startTime,
        electionProps.endTime,
        electionProps.candidateCount,
        votersTree.getRoot(),
        candidatesTree.getRoot()
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    expect(zkAppInstance.startTime.get().toFields()).toEqual(electionProps.startTime.toFields());
    expect(zkAppInstance.endTime.get().toFields()).toEqual(electionProps.endTime.toFields());
    expect(zkAppInstance.candidateCount.get()).toEqual(electionProps.candidateCount);

    let isCandidateTreeValid = Bool(false);

    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.check(candidatesTree.getRoot());
      isCandidateTreeValid = Bool(true);

      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();

    expect(isCandidateTreeValid).toEqual(Bool(true));
  });
});
