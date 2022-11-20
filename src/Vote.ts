import {
  Field,
  SmartContract,
  state,
  State,
  Signature,
  method,
  DeployArgs,
  Permissions,
  Bool,
  UInt32,
  Poseidon,
  PrivateKey,
  Circuit,
  UInt64,
  PublicKey,
  MerkleWitness,
  Reducer,
  Struct,
  CircuitValue,
  prop
} from 'snarkyjs';

import { assertRootUpdateValid } from './offchain-storage.js';

export const height = 256;

class OffchainStorageMerkleWitness extends MerkleWitness(height) {}


class MerkleWitnessClass extends MerkleWitness(8) { }

class Voter extends Struct({
  key: PublicKey,
  isVoted: Bool,
}) {
  constructor(key: PublicKey, isVoted: Bool) {
    super({ key, isVoted });
    this.key = key;
    this.isVoted = isVoted;
  }

  hash(): Field {
    return Poseidon.hash(this.key.toFields().concat(this.isVoted.toFields()));
  }

  vote(): Voter {
    return new Voter(this.key, Bool(true));
  }
};

class Candidate extends CircuitValue {
  @prop key: Field;
  @prop voteCount: Field;
  @prop witness: MerkleWitnessClass;

  constructor(key: Field, voteCount: Field) {
    super({ key, voteCount });
    this.key = key;
    this.voteCount = voteCount;
  }

  hash(): Field {
    return Poseidon.hash(this.key.toFields().concat(this.voteCount.toFields()));
  }

  addVote(): Candidate {
    return new Candidate(this.key, this.voteCount.add(1));
  }
};

export class Vote extends SmartContract {
  @state(Field) voterTreeRoot = State<Field>(); // Merkle root of voters
  @state(Field) voterRootNumber = State<Field>();
  @state(Field) candidateTreeRoot = State<Field>(); // Merkle root of candidates
  @state(Field) candidateRootNumber = State<Field>();
  @state(UInt32) candidateCount = State<UInt32>(); // How many candidates to vote for
  @state(UInt64) startTime = State<UInt64>(); // The starting time of the voting process in UNIX Time
  @state(UInt64) endTime = State<UInt64>(); // The ending time of the voting process in UNIX Time

  @state(Bool) isFinished = State<Bool>();
  @state(Field) committedCandidates = State<Field>();
  @state(Field) accumulatedCandidates = State<Field>();
  @state(PublicKey) serverPublicKey = State<PublicKey>();

  reducer = Reducer({ actionType: Candidate });

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      editSequenceState: Permissions.proofOrSignature(),
    });
    this.voterTreeRoot.set(Field(0)); // Final state of public keys
    this.candidateCount.set(UInt32.zero);
    this.startTime.set(UInt64.zero);
    this.endTime.set(UInt64.zero);

    this.isFinished.set(Bool(false));
    this.accumulatedCandidates.set(Reducer.initialActionsHash);
  };

  // @method setElection(startTime: UInt64, endTime: UInt64, votersArray: PublicKey[], candidateArray: PublicKey[]){
  //   this.startTime.set(startTime);
  //   this.endTime.set(endTime);
  //   // Store voters array at DB
  //   // Calculate merkle root of voters array and set as state
  //   // Store candidates array at DB
  //   // Calculate merkle root of candidates array and set as state

  // }

  @method vote(
    key: PrivateKey,
    votes: UInt32[],
    path: MerkleWitnessClass
  ) {
    // Proof
    // Election Conditions

    // Check if election is started and not finished
    const startTime = this.startTime.get();
    const endTime = this.endTime.get();
    this.network.timestamp.assertBetween(startTime, endTime);

    // Voter Conditions
    let voterTreeRoot = this.voterTreeRoot.get();
    this.voterTreeRoot.assertEquals(voterTreeRoot);

    const voter = new Voter(key.toPublicKey(), Bool(false)); // Create a new voter with public key and is_voted: false

    path.calculateRoot(voter.hash()).assertEquals(voterTreeRoot); // If already voted this voter will not be in the tree

    // We know the voter is valid

    // Votes Conditions
    const votesLength = votes.reduce((sum) => sum.add(1), UInt32.from(0)); // Calculate votes length
    votes.reduce((sum) => sum.add(1), UInt32.from(0)).assertEquals(votesLength);

    const candidateCount = this.candidateCount.get();
    this.candidateCount.get().assertEquals(candidateCount);
    votesLength.assertEquals(candidateCount);

    votes
      .reduce(
        (sum, each) =>
          sum.add(
            Circuit.if(
              Bool.or(each.equals(UInt32.from(0)), each.equals(UInt32.from(1))),
              Field(0),
              Field(1)
            )
          ),
        Field(0)
      )
      .assertEquals(Field(0)); // Are all the votes 0 or 1

    // Set merkle tree is_voted: true
    const newVoter = voter.vote();
    const newVoterTreeRoot = path.calculateRoot(newVoter.hash());
    this.voterTreeRoot.set(newVoterTreeRoot);

    const candidatesToVote = votes.map((each, i) => {
      return {
        key: i,
        vote: each
      }
    }).filter(each => each.vote.gt(UInt32.from(0))).map(each => Field(each.key));

    candidatesToVote.forEach(candidate => this.reducer.dispatch(new Candidate(candidate, Field(0))));
  };

  @method tallyElection() {
    const isFinished = this.isFinished.get();
    this.isFinished.assertEquals(isFinished);
    isFinished.assertEquals(Bool(false));

    const accumulatedCandidates = this.accumulatedCandidates.get();
    this.accumulatedCandidates.assertEquals(accumulatedCandidates);

    const committedCandidates = this.committedCandidates.get();
    this.committedCandidates.assertEquals(committedCandidates);

    const { state: newCommittedCandidates, actionsHash: newAccumulatedCandidates } = this.reducer.reduce(
      this.reducer.getActions({ fromActionHash: accumulatedCandidates }),
      Field,
      (state: Field, action: Candidate) => {
        action = action.addVote();

        return action.witness.calculateRoot(action.hash());
      },
      { state: committedCandidates, actionsHash: accumulatedCandidates }
    );

    this.accumulatedCandidates.set(newAccumulatedCandidates);
    this.committedCandidates.set(newCommittedCandidates);
    this.isFinished.set(Bool(true));
  };

  @method update(
    leafIsEmpty: Bool,
    oldNum: Field,
    num: Field,
    path: OffchainStorageMerkleWitness,
    storedNewRoot__: Field,
    storedNewRootNumber: Field,
    storedNewRootSignature: Signature
  ) {
    let root = this.voterTreeRoot.get();
    this.voterTreeRoot.assertEquals(root);

    let rootNumber = this.voterRootNumber.get();
    this.voterRootNumber.assertEquals(rootNumber);

    let serverPublicKey = this.serverPublicKey.get();
    this.serverPublicKey.assertEquals(serverPublicKey);

    let leaf = [oldNum];
    let newLeaf = [num];

    // newLeaf can be a function of the existing leaf
    newLeaf[0].assertGt(leaf[0]);

    const updates = [
      {
        leaf,
        leafIsEmpty,
        newLeaf,
        newLeafIsEmpty: Bool(false),
        leafWitness: path,
      },
    ];

    const storedNewRoot = assertRootUpdateValid(
      serverPublicKey,
      rootNumber,
      root,
      updates,
      storedNewRootNumber,
      storedNewRootSignature
    );

    this.voterTreeRoot.set(storedNewRoot);
    this.voterRootNumber.set(storedNewRootNumber);
  };
}
