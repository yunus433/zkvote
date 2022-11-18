import {
  prop,
  Field,
  SmartContract,
  state,
  State,
  method,
  DeployArgs,
  Permissions,
  Bool,
  UInt32,
  Poseidon,
  PrivateKey,
  Circuit,
  CircuitValue,
  Experimental,
  UInt64,
  arrayProp,
  PublicKey,
  MerkleWitness
} from 'snarkyjs';

import { fieldLog2LowerLimit } from './utilities';

const MAX_CANDIDATE_COUNT = 1e2; // Max candidate count in an election
const MAX_VOTER_COUNT = 1e6; // Max voter count in an election

let initialVotersMerkleRoot: Field = Field(0); // off-chain storage
let intiialCandidatesMerkleRoot: Field = Field(0);
let initialCandidateCount: UInt32 = UInt32.from(0);

class MerkleWitnessClass extends MerkleWitness(8) {}

class Voter extends CircuitValue {
  @prop key: PublicKey;
  @prop isVoted: Bool;

  constructor(key: PublicKey, isVoted: Bool) {
    super(key, isVoted);
    this.key = key;
    this.isVoted = isVoted;
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }

  vote(): Voter {
    return new Voter(this.key, Bool(true));
  }
}

class Candidate extends CircuitValue {
  @prop key: Field; // Merkle tree index
  @prop voteCount: Field;

  constructor(key: Field, voteCount: Field) {
    super(key, voteCount);
    this.key = key;
    this.voteCount = voteCount;
  }

  hash(): Field {
    return Poseidon.hash(this.toFields()); 
  }

  addVote(): Candidate {
    return new Candidate(this.key, this.voteCount.add(1));
  }
}

class Ballot extends CircuitValue { // Oy pusulası
  @prop voterPublicKey: PublicKey;
  @arrayProp(UInt32, MAX_CANDIDATE_COUNT) votes: UInt32[]; // 0, 1, 0, 0, 0 => 5 candidate, vote for 2nd

  constructor(key: PublicKey, votes: UInt32[]) {
    super(key, votes);
    this.voterPublicKey = key;
    this.votes = votes;
  }

  hash(): Field {
    return Poseidon.hash(this.toFields());
  }
}

export class Vote extends SmartContract {
  @state(Field) voters = State<Field>(); // Merkle tree
  @state(Field) candidates = State<Field>(); // Merkle tree
  @state(Field) candidatesAccumulator = State<Field>(); // Temp variable
  @state(UInt32) candidateCount = State<UInt32>(); // How many candidates to vote for
  @state(Bool) isFinished = State<Bool>();

 recuder = Experimental.Reducer({ actionType: Ballot });

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      editSequenceState: Permissions.proofOrSignature(),
    });
    this.voters.set(initialVotersMerkleRoot); // Final state of publci keys
    this.candidates.set(intiialCandidatesMerkleRoot);
    this.candidateCount.set(initialCandidateCount);
  }

  @method createBallot(key: PrivateKey, votes: UInt32[], path: MerkleWitnessClass) { // Proof
    // Election Conditions
    const isFinished = this.isFinished.get();
    this.isFinished.get().assertEquals(isFinished);
    isFinished.assertEquals(Bool(false));

    // Voter Conditions
    let voters = this.voters.get();
    this.voters.assertEquals(voters);

    const voter = new Voter(
      key.toPublicKey(),
      Bool(false)
    ); // Create a new voter with public key and is_voted: false

    path.calculateRoot(voter.hash()).assertEquals(voters); // If already voted this voter will not be in the tree

    // We know the voter is valid

    // Votes Conditions
    const votesLength = votes.reduce((sum, _) => sum.add(1), UInt32.from(0)); // Calculate votes length
    votes.reduce((sum, _) => sum.add(1), UInt32.from(0)).assertEquals(votesLength);

    const candidateCount = this.candidateCount.get();
    this.candidateCount.get().assertEquals(candidateCount);
    votesLength.assertEquals(candidateCount);

    votes.reduce((sum, each) => sum.add(Circuit.if(Bool.or(each.equals(UInt32.from(0)), each.equals(UInt32.from(1))), Field(0), Field(1))), Field(0)).assertEquals(Field(0)); // Are all the votes 0 or 1

    // Set merkle tree is_voted: true
    const newVoter = voter.vote();
    const newVoters = path.calculateRoot(newVoter.hash());
    this.voters.set(newVoters);

    const ballot = new Ballot(voter.key, votes);

    this.recuder.dispatch(ballot);
  }

  @method tallyElection() {
    // Election Conditions
    const isFinished = this.isFinished.get();
    this.isFinished.get().assertEquals(isFinished);
    isFinished.assertEquals(Bool(false));

    this.isFinished.set(Bool(true)); // Finish the election, start the count

    let { state: newCommittedVotes, actionsHash: newAccumulatedVotes } =
      this.reducer.reduce(
        this.reducer.getActions({ fromActionHash: accumulatedVotes }), // actionsHash is an array of ALL valid ballots
        Field,
        (state: Field, action: Member) => {
          // apply one vote
          action = action.addVote();
          // this is the new root after we added one vote
          return action.votesWitness.calculateRoot(action.getHash());
        },
        // initial state
        { state: committedVotes, actionsHash: accumulatedVotes }
      );
  }


  // @method countVotes() {
    // let accumulator = this.votedTreeAccumulator.get();
    // this.votedTreeAccumulator.assertEquals(accumulator);

    // let votes = this.votedTree.get();
    // this.votedTree.assertEquals(votes);

    // let { state: newVotes, actionsHash: newAccumulator } =
    //   this.reducer.reduce(
    //     this.reducer.getActions({ fromActionHash: accumulatedVotes }),
    //     Field,
    //     (state: Field, action: Member) => {
    //       // apply one vote
    //       action = action.addVote();
    //       // this is the new root after we added one vote
    //       return action.votesWitness.calculateRoot(action.getHash());
    //     },
    //     // initial state
    //     { state: committedVotes, actionsHash: accumulatedVotes }
    //   );
    // }
}
