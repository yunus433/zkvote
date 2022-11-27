import {
  isReady,
  Mina,
  shutdown,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  MerkleTree,
  Field,
  Bool
} from 'snarkyjs';
import { Vote, Voter, Candidate, MerkleWitnessClass } from './Vote';

const DEFAULT_PASSWORD = 0;
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
      
      voters = testAccounts.filter((_, i) => i > 0 && i < 4).map(each => (new Voter(each.publicKey, Field(DEFAULT_PASSWORD), Bool(false)).hash()));
      
      const tree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
      candidates = Array.from({ length: 5 }, (_, i) => (new Candidate(Field(i), Field(0), new MerkleWitnessClass(tree.getWitness(BigInt(i))))).hash());

      zkAppInstance.deploy({ zkappKey: zkAppPrivateKey });
    });
    await txn.send();
  });

  afterAll(async () => {
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Vote` smart contract with election params', async () => {
    electionProps = {
      startTime: UInt64.from((new Date()).getTime() - 500),
      endTime: UInt64.from((new Date()).getTime() + (60 * 60 * 1000)),
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
        electionProps.candidateCount,
        votersTree.getRoot(),
        candidatesTree.getRoot()
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    expect(zkAppInstance.candidateCount.get()).toEqual(electionProps.candidateCount);
    expect(zkAppInstance.candidatesTree.get()).toEqual(candidatesTree.getRoot());
  });

  it('first voter votes for the candidate 0', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let zkVotersTree: Field = Field(0);

    const random = Field(Math.floor(Math.random() * 10000000));

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check the voters tree correctly found in the contract

      zkAppInstance.setPassword(
        testAccounts[1].privateKey,
        Field(DEFAULT_PASSWORD),
        random,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(0)))), // voter 0
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkVotersTree = zkAppInstance.vote(
        testAccounts[1].privateKey,
        random,
        Field(0),
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(0)))),
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(0)))),
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();
    
    voters[0] = (new Voter(testAccounts[1].publicKey, random, Bool(true))).hash(); // Update offchain storage
    votersTree.setLeaf(BigInt(0), voters[0]);

    expect(zkVotersTree).toEqual(votersTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('second voter votes for the candidate 0', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let zkVotersTree: Field = Field(0);

    const random = Field(Math.floor(Math.random() * 10000000));

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check the voters tree correctly found in the contract

      zkAppInstance.setPassword(
        testAccounts[2].privateKey,
        Field(DEFAULT_PASSWORD),
        random,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(1)))), // voter 1
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkVotersTree = zkAppInstance.vote(
        testAccounts[2].privateKey,
        random,
        Field(0),
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(1)))), // voter 1
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(0)))), // candidate 2
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();
    
    voters[1] = (new Voter(testAccounts[2].publicKey, random, Bool(true))).hash(); // Update offchain storage
    votersTree.setLeaf(BigInt(1), voters[1]);

    expect(zkVotersTree).toEqual(votersTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('tally election and returns each candidate count correctly', async () => {
    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.tally();
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    let candidate0VoteCount = Field(0), candidate1VoteCount = Field(0);

    const txn2 = await Mina.transaction(deployerAccount, () => {
      candidate0VoteCount = zkAppInstance.count(Field(0));
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();

    expect(candidate0VoteCount).toEqual(Field(2));

    const txn3 = await Mina.transaction(deployerAccount, () => {
      candidate1VoteCount = zkAppInstance.count(Field(1));
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn3.send();

    expect(candidate1VoteCount).toEqual(Field(0));
  })
});
