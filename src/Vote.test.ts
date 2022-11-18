import { Vote } from './Vote';
import {
  isReady,
  Mina,
  shutdown,
  Field,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt32,
  UInt64,
  Bool
} from 'snarkyjs';

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  return Local.testAccounts[0].privateKey;
}

describe('Vote', () => {
  let deployerAccount: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkAppInstance: Vote
  ;

  beforeAll(async () => {
    await isReady;
    deployerAccount = createLocalBlockchain();
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkAppInstance = new Vote(zkAppAddress);
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkAppInstance.deploy({ zkappKey: zkAppPrivateKey });
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send().wait();
  });

  afterAll(async () => {
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Vote` smart contract with election params', async () => {
    const electionProps = {
      startTime: UInt64.from((new Date()).getTime()),
      endTime: UInt64.from((new Date()).getTime() + (24 * 60 * 60 * 1000)),
      minVoteCountPerBallot: UInt32.from(1),
      maxVoteCountPerBallot: UInt32.from(1),
      isMultipleAllowed: Bool(false),
      candidateCount: UInt32.from(5),
      voterCount: UInt32.from(100)
    };

    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.createElection(
        electionProps.startTime,
        electionProps.endTime,
        electionProps.minVoteCountPerBallot,
        electionProps.maxVoteCountPerBallot,
        electionProps.isMultipleAllowed,
        electionProps.candidateCount,
        electionProps.voterCount
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send().wait();

    expect(zkAppInstance.election.get().startTime.toFields()).toEqual(electionProps.startTime.toFields());
    expect(zkAppInstance.election.get().endTime.toFields()).toEqual(electionProps.endTime.toFields());
    expect(zkAppInstance.election.get().minVoteCountPerBallot).toEqual(electionProps.minVoteCountPerBallot);
    expect(zkAppInstance.election.get().maxVoteCountPerBallot).toEqual(electionProps.maxVoteCountPerBallot);
    expect(zkAppInstance.election.get().isMultipleAllowed).toEqual(electionProps.isMultipleAllowed);
    expect(zkAppInstance.election.get().candidateCount).toEqual(electionProps.candidateCount);
    expect(zkAppInstance.election.get().voterCount).toEqual(electionProps.voterCount);
  });
});
