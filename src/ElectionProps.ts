import {
  Bool,
  CircuitValue,
  Field,
  prop,
  PublicKey,
  UInt64,
  Poseidon,
  arrayProp,
  UInt32
} from 'snarkyjs';

import { fieldLog2LowerLimit } from './utilities';
import { MerkleTree } from './merkle_tree';

const MAX_CANDIDATE_COUNT = 1e2; // Max candidate count in an election
const MAX_VOTER_COUNT = 1e6; // Max voter count in an election

class Cover <
  Type extends {
    toFields(): Field[]
  }
> extends CircuitValue {
  @prop value: Type;

  constructor(
    value: Type
  ) {
    super();

    this.value = value;
  }

  getHash(): Field {
    return Poseidon.hash(this.value.toFields());
  }
};

export class ElectionProps extends CircuitValue {
  @prop startTime: UInt64; // Start time of the election
  @prop endTime: UInt64; // End time of the election, > startTime
  @prop minVoteCountPerBallot: UInt32; // Min number of candidates that the voters must vote in the ballot
  @prop maxVoteCountPerBallot: UInt32; // Max number of candidates that the voters can vote in the ballot
  @prop isMultipleAllowed: Bool; // Only if maxVoteCountPerBallot > minVoteCountPerBallot: Can voters vote on the same candidate multiple times
  @prop candidateCount: UInt32; // Actual length of the candidateList array
  @prop voterCount: UInt32;
  @arrayProp(UInt32, MAX_CANDIDATE_COUNT) candidates: UInt32[]; // Array storing the number of votes for each candidate. Key in the array is the ID of the candidate
  @prop voters: Field; // Root of the merkle tree with the private keys of elligible voters

  constructor(
    startTime: UInt64,
    endTime: UInt64,
    minVoteCountPerBallot: UInt32,
    maxVoteCountPerBallot: UInt32,
    isMultipleAllowed: Bool,
    candidateCount: UInt32,
    voterCount: UInt32
  ) {
    super();

    startTime.assertLt(endTime); // startTime must be < endTime
    minVoteCountPerBallot.assertGte(UInt32.from(0)); // Min vote count allowed is 0
    maxVoteCountPerBallot.assertLte(UInt32.from(MAX_CANDIDATE_COUNT)); // MAX_CANDIDATE_COUNT is also max vote count allowed in a ballot
    minVoteCountPerBallot.assertLte(maxVoteCountPerBallot); // minVoteCount must be <= maxVoteCount
    candidateCount.assertGt(UInt32.from(0));
    candidateCount.assertLte(UInt32.from(MAX_CANDIDATE_COUNT)); // candidateCount must be <= MAX_CANDIDATE_COUNT
    voterCount.assertGt(UInt32.from(0)); // voterCount must be > 0
    voterCount.assertLte(UInt32.from(MAX_VOTER_COUNT)); // voterCount must be <= MAX_VOTER_COUNT

    this.startTime = startTime;
    this.endTime = endTime;
    this.minVoteCountPerBallot = minVoteCountPerBallot;
    this.maxVoteCountPerBallot = maxVoteCountPerBallot;
    this.isMultipleAllowed = isMultipleAllowed;
    this.candidateCount = candidateCount;
    this.voterCount = voterCount;

    // Initialize list
    this.candidates = Array.from({ length: Number(MAX_CANDIDATE_COUNT) }, _ => UInt32.from(0));
    this.voters = (new MerkleTree<Cover<PublicKey>>(Number(fieldLog2LowerLimit(this.voterCount.value)))).getRoot();

    // const voterListLength = voterList.reduce((sum, _) => sum.add(1), Field(0));
    // voterList.reduce((sum, _) => sum.add(1), Field(0)).assertEquals(voterListLength);
  };
};
