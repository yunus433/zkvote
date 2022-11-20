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
  MerkleTree,
  MerkleWitness,
  Reducer,
  Struct,
  CircuitValue,
  prop
} from 'snarkyjs';

import { assertRootUpdateValid, get, requestStore, getPublicKey, makeRequest,mapToTree, Update  } from './offchain-storage.js';

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
  @state(UInt64) endTime = State<UInt64>(); // The ending time of the voting process in UNIX Time

 // @state(Bool) isFinished = State<Bool>();
  @state(Field) committedCandidates = State<Field>();
  @state(Field) accumulatedCandidates = State<Field>();
  @state(PublicKey) serverPublicKey = State<PublicKey>();

  reducer = Reducer({ actionType: Candidate });

  _serverPublicKey: PublicKey;

  constructor(zkAppAddress: PublicKey, serverPublicKey: PublicKey) {
    super(zkAppAddress)
    this._serverPublicKey = serverPublicKey;
  }

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.setPermissions({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
      editSequenceState: Permissions.proofOrSignature(),
    });
    
    const voterTree = new MerkleTree(height);
    const voterTreeRoot = voterTree.getRoot();
    this.voterTreeRoot.set(voterTreeRoot);
    const _voterrootNumber = Field(0);
    this.voterRootNumber.set(_voterrootNumber);

    const candidateTree = new MerkleTree(height);
    const candidateTreeRoot = candidateTree.getRoot();
    this.candidateTreeRoot.set(candidateTreeRoot);
    const _candidaterootNumber = Field(0);
    this.candidateRootNumber.set(_candidaterootNumber);

    this.candidateCount.set(UInt32.zero);
    


    //this.isFinished.set(Bool(false));
    this.accumulatedCandidates.set(Reducer.initialActionsHash);
  };

  @method startElection(endTime: UInt64, votersArray: PublicKey[], voterTreeNum: Field, voterTreeSignature: Signature, candidateArray: PublicKey[], candidateTreeNum: Field, candidateRootSignature: Signature){
    this.endTime.set(endTime);
    const emptyLeaf = Field(0);
    const voterTree = new MerkleTree(height);
    var updates: Update[];
    for(var index in votersArray){
      let leaf = Field(votersArray[index].toBase58());
      voterTree.setLeaf(BigInt(index), leaf)
      updates.push( {
        emptyLeaf,
        leafIsEmpty:Bool(true),
        leaf,
        newLeafIsEmpty: Bool(false),
        leafWitness: voterTree.getWitness(BigInt(index))
      })
      // set index* leaf to corresponding public key in from the votersArray
    }

    let voterTreeRoot = this.voterTreeRoot.get();
    this.voterTreeRoot.assertEquals(voterTreeRoot);

    let voterRootNumber = this.voterRootNumber.get();
    this.voterRootNumber.assertEquals(voterRootNumber);

    let serverPublicKey = this.serverPublicKey.get();
    this.serverPublicKey.assertEquals(serverPublicKey);

    const storedNewRoot = assertRootUpdateValid(
      serverPublicKey,
      voterRootNumber,
      voterTreeRoot,
      updates,
      voterTreeNum,
      voterTreeSignature
    );
    //then post the final merkle tree to offchain-storage
    //do the same for the candidateArray

  }

  @method vote(
    key: PrivateKey,
    votes: UInt32[],
    path: MerkleWitnessClass
  ) {
    // Proof
    // Election Conditions

    // Check if election is started and not finished
    const endTime = this.endTime.get();
    const now = this.network.timestamp.get();
    now.assertLt(endTime);

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
    /*
    const isFinished = this.isFinished.get();
    this.isFinished.assertEquals(isFinished);
    isFinished.assertEquals(Bool(false));
*/
    const endTime = this.endTime.get();
    const now = this.network.timestamp.get();
    now.assertGt(endTime);
    // we assumed endTime>startTime
    // assert endTime>starttime and endTime & startTime is not equal to zero
    // assert endTime-startTime>minDuration  -> minDuration is equals to a 
    // small amount of meaningful time on mina blockchain

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
    //this.isFinished.set(Bool(true));
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
