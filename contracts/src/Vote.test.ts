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
  Bool,
  Poseidon,
  
} from 'snarkyjs';

import { Vote, Voter, Candidate, MerkleWitnessClass, IdentityCommitment } from './Vote';

const MAX_MERKLE_TREE_HEIGHT = 32;

let testAccounts: {
  publicKey: PublicKey;
  privateKey: PrivateKey;
}[];


let voters: Field[]; // Offchain storage to test
let candidates: Field[]; // Offchain storage to test
let identityCommitments: IdentityCommitment[];
let electionProps: {
  startTime: UInt64,
  endTime: UInt64,
  candidateCount: Field
}; // Initilization conditions, not stored anywhere normally

let firstVoterPrivateNullifier: Field; // mimics local storage of voter number one
let secondVoterPrivateNullifier: Field; // mimics local storage of voter number two
let thirdVoterPrivateNullifier: Field; // mimics local storage of voter number three


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
    firstVoterPrivateNullifier = Field.random();
    secondVoterPrivateNullifier = Field.random();
    thirdVoterPrivateNullifier = Field.random();
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkAppInstance = new Vote(zkAppAddress);
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      
      voters = testAccounts.filter((_, i) => i > 0 && i < 4).map(each => (new Voter(each.publicKey, Bool(false)).hash()));
      
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
        electionProps.startTime,
        electionProps.endTime,
        electionProps.candidateCount,
        votersTree.getRoot(),
        candidatesTree.getRoot()
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

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

  it('first voter commits identity', async () => {
    let returnArray: Field[] = [];

    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    let newIdentityCommitments: IdentityCommitment[] = [new IdentityCommitment(Poseidon.hash(testAccounts[1].privateKey.toFields().concat(firstVoterPrivateNullifier)),Poseidon.hash(zkAppAddress.toFields().concat(firstVoterPrivateNullifier)), Bool(false))];
    identityCommitments = newIdentityCommitments; // Update offchain storage

    const commitmentTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      commitmentTree.setLeaf(BigInt(i), identityCommitments[i].hash());

    const txn = await Mina.transaction(testAccounts[1].privateKey, () => {

      returnArray = zkAppInstance.commitIdentity(
        testAccounts[1].privateKey,
        firstVoterPrivateNullifier,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(0)))),
        (new MerkleWitnessClass(commitmentTree.getWitness(BigInt(0))))
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
     await txn.send();
  
  });
  it('second voter commits identity', async () => {
    let returnArray: Field[] = [];

    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);
    
    identityCommitments.push(new IdentityCommitment(Poseidon.hash(testAccounts[2].privateKey.toFields().concat(secondVoterPrivateNullifier)),Poseidon.hash(zkAppAddress.toFields().concat(secondVoterPrivateNullifier)), Bool(false)))
    const commitmentTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      commitmentTree.setLeaf(BigInt(i), identityCommitments[i].hash());

    const txn = await Mina.transaction(testAccounts[2].privateKey, () => {

      returnArray = zkAppInstance.commitIdentity(
        testAccounts[2].privateKey,
        secondVoterPrivateNullifier,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(1)))),
        (new MerkleWitnessClass(commitmentTree.getWitness(BigInt(1))))
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
     await txn.send();
  
  });

  it('third voter commits identity', async () => {
    let returnArray: Field[] = [];

    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);
      
    identityCommitments.push(new IdentityCommitment(Poseidon.hash(testAccounts[3].privateKey.toFields().concat(thirdVoterPrivateNullifier)),Poseidon.hash(zkAppAddress.toFields().concat(thirdVoterPrivateNullifier)), Bool(false)))
  
    const commitmentTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      commitmentTree.setLeaf(BigInt(i), identityCommitments[i].hash());

    const txn = await Mina.transaction(testAccounts[3].privateKey, () => {

      returnArray = zkAppInstance.commitIdentity(
        testAccounts[3].privateKey,
        thirdVoterPrivateNullifier,
        (new MerkleWitnessClass(votersTree.getWitness(BigInt(2)))),
        (new MerkleWitnessClass(commitmentTree.getWitness(BigInt(2))))
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
     await txn.send();
  
  });
  

  it('first voter votes for candidate 0', async () => {
    const identityCommitmentsTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      identityCommitmentsTree.setLeaf(BigInt(i), identityCommitments[i].hash());

    
    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let zkVotersTree: Field = Field(0);

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.commitmentsTree.get()).toEqual(identityCommitmentsTree.getRoot()); // Check the voters tree correctly found in the contract

      zkVotersTree = zkAppInstance.vote(
        testAccounts[1].privateKey,
        firstVoterPrivateNullifier,
        Field(0),
        (new MerkleWitnessClass(identityCommitmentsTree.getWitness(BigInt(0)))),
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(0)))),
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
    
    identityCommitments[0] = identityCommitments[0].vote(); // Update offchain storage
    identityCommitmentsTree.setLeaf(BigInt(0), identityCommitments[0].hash());

    expect(zkVotersTree).toEqual(identityCommitmentsTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('second voter votes for candidate 2', async () => {
    const identityCommitmentsTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      identityCommitmentsTree.setLeaf(BigInt(i), identityCommitments[i].hash());

    
    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let zkVotersTree: Field = Field(0);

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.commitmentsTree.get()).toEqual(identityCommitmentsTree.getRoot()); // Check the voters tree correctly found in the contract

      zkVotersTree = zkAppInstance.vote(
        testAccounts[2].privateKey,
        secondVoterPrivateNullifier,
        Field(2),
        (new MerkleWitnessClass(identityCommitmentsTree.getWitness(BigInt(1)))),
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(2)))),
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
    
    identityCommitments[1] = identityCommitments[1].vote(); // Update offchain storage
    identityCommitmentsTree.setLeaf(BigInt(1), identityCommitments[1].hash());

    expect(zkVotersTree).toEqual(identityCommitmentsTree.getRoot()); // Check if the state of voter correctly updated
  });

});