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

  it('first voter creates identity commitment', async () => {

    let firstVoterPrivateKey: PrivateKey = testAccounts[1].privateKey;
    firstVoterPrivateNullifier = Field.random();
    
    let identity: Field[] = [];

    const txn = await Mina.transaction(deployerAccount, () => {
    identity = zkAppInstance.commitIdentity(
      testAccounts[1].privateKey,
      firstVoterPrivateNullifier,
    );
    zkAppInstance.sign(zkAppPrivateKey);
    
    });

    await txn.send();
    
    let VoterIdentityCommitment: Field = Poseidon.hash(firstVoterPrivateKey.toFields().concat(firstVoterPrivateNullifier));
    let PublicNullifier: Field = Poseidon.hash(zkAppAddress.toFields().concat(firstVoterPrivateNullifier));
    expect(identity[0]).toEqual(VoterIdentityCommitment);
    expect(identity[1]).toEqual(PublicNullifier);
    //identityCommitments.push(new IdentityCommitment(VoterIdentityCommitment,PublicNullifier, Bool(false)))


  });


  it('second voter creates identity commitment', async () => {

    let secondVoterPrivateKey = testAccounts[2].privateKey;
    secondVoterPrivateNullifier = Field.random();
    let VoterIdentityCommitment = Poseidon.hash([Field(secondVoterPrivateKey.toFields()[0]).add(secondVoterPrivateNullifier)]);
    let PublicNullifier = Poseidon.hash([Field(zkAppAddress.toBase58()).add(secondVoterPrivateNullifier)]);
    identityCommitments.push(new IdentityCommitment(VoterIdentityCommitment, PublicNullifier, Bool(false)))

  });
  
  it('first voter votes for the candidate 0', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const commitmentsTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      commitmentsTree.setLeaf(BigInt(i), identityCommitments[i].hash())

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let newCommitmentsTree: Field = Field(0);

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.commitmentsTree.get()).toEqual(commitmentsTree.getRoot()); // Check the voters tree correctly found in the contract

      newCommitmentsTree = zkAppInstance.vote(
        testAccounts[1].privateKey,
        firstVoterPrivateNullifier,
        Field(0),
        (new MerkleWitnessClass(commitmentsTree.getWitness(BigInt(0)))),
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(0)))),
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
    let VoterIdentityCommitment: Field = Poseidon.hash(testAccounts[1].privateKey.toFields().concat(firstVoterPrivateNullifier));
    identityCommitments[0] = new IdentityCommitment(VoterIdentityCommitment,firstVoterPrivateNullifier, Bool(true)); // Update offchain storage
    commitmentsTree.setLeaf(BigInt(0), identityCommitments[0].hash());

    expect(newCommitmentsTree).toEqual(commitmentsTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('second voter votes for the candidate 2', async () => {
    const votersTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < voters.length; i++)
      votersTree.setLeaf(BigInt(i), voters[i]);

    const commitmentsTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < identityCommitments.length; i++)
      commitmentsTree.setLeaf(BigInt(i), identityCommitments[i].hash())

    const candidatesTree = new MerkleTree(MAX_MERKLE_TREE_HEIGHT);
    for (let i = 0; i < candidates.length; i++)
      candidatesTree.setLeaf(BigInt(i), candidates[i]);

    let newCommitmentsTree: Field = Field(0);

    const txn = await Mina.transaction(deployerAccount, () => {
      expect(zkAppInstance.commitmentsTree.get()).toEqual(commitmentsTree.getRoot()); // Check the voters tree correctly found in the contract

      newCommitmentsTree = zkAppInstance.vote(
        testAccounts[2].privateKey,
        firstVoterPrivateNullifier,
        Field(2),
        (new MerkleWitnessClass(commitmentsTree.getWitness(BigInt(1)))),
        (new MerkleWitnessClass(candidatesTree.getWitness(BigInt(2)))),
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
    let VoterIdentityCommitment: Field = Poseidon.hash(testAccounts[2].privateKey.toFields().concat(firstVoterPrivateNullifier));
    identityCommitments[1] = new IdentityCommitment(VoterIdentityCommitment,secondVoterPrivateNullifier, Bool(true)); // Update offchain storage
    commitmentsTree.setLeaf(BigInt(1), identityCommitments[1].hash());

    expect(newCommitmentsTree).toEqual(commitmentsTree.getRoot()); // Check if the state of voter correctly updated
  });

  it('tally votes', async () => {
    let results = zkAppInstance.tally();
    expect(Field(results[0].toString())).toEqual(Field(1));
    expect(Field(results[2].toString())).toEqual(Field(1));
  });
});
