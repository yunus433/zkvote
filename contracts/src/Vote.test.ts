import {
  AccountUpdate,
  Bool,
  Field,
  isReady,
  MerkleTree,
  Mina,
  PrivateKey,
  PublicKey,
  shutdown,
} from 'snarkyjs';

import {
  Candidate,
  MerkleWitnessClass,
  Vote,
  Voter,
} from './Vote';

const DEFAULT_PASSWORD = 0;
const MAX_MERKLE_TREE_HEIGHT = 32;

let candidates: Field[]; // Offchain storage to test
let testAccounts: {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}[]; // Test Accounts
let voters: Field[]; // Offchain storage to test

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  testAccounts = Local.testAccounts;
  return Local.testAccounts[0].privateKey;
};

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

  it('generates and deploys the `Vote` smart contract', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.start(
        votersTree.getRoot(),
        candidatesTree.getRoot()
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot());
    expect(zkAppInstance.candidatesTree.get()).toEqual(candidatesTree.getRoot());
  });

  it('first voter votes for the candidate 0', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

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
      zkAppInstance.vote(
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

    expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('second voter votes for the candidate 0', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

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
      zkAppInstance.vote(
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

    expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('third voter votes for the candidate 1', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    const random = Field(Math.floor(Math.random() * 10000000));

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check the voters tree correctly found in the contract

      zkAppInstance.setPassword(
        testAccounts[3].privateKey,
        Field(DEFAULT_PASSWORD),
        random,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(2)))), // voter 2
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.vote(
        testAccounts[3].privateKey,
        random,
        Field(1),
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(2)))), // voter 2
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(1)))), // candidate 1
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();
    
    voters[2] = (new Voter(testAccounts[3].publicKey, random, Bool(true))).hash(); // Update offchain storage
    votersTree.setLeaf(BigInt(2), voters[2]);

    expect(zkAppInstance.votersTree.get()).toEqual(votersTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('tally election and returns each candidate count correctly', async () => {
    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.tally();
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    let candidate0VoteCount = Field(0), candidate1VoteCount = Field(0), candidate2VoteCount = Field(0);

    const txn2 = await Mina.transaction(deployerAccount, () => {
      candidate0VoteCount = zkAppInstance.count(Field(0));
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn2.send();

    const txn3 = await Mina.transaction(deployerAccount, () => {
      candidate1VoteCount = zkAppInstance.count(Field(1));
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn3.send();

    const txn4 = await Mina.transaction(deployerAccount, () => {
      candidate2VoteCount = zkAppInstance.count(Field(2));
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn4.send();

    expect(candidate0VoteCount).toEqual(Field(2));
    expect(candidate1VoteCount).toEqual(Field(1));
    expect(candidate2VoteCount).toEqual(Field(0));
  });
});
