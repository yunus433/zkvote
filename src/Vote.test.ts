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
    await txn.send();
  });

  afterAll(async () => {
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Vote` smart contract with election params', async () => {
    const electionProps = {
      startTime: UInt64.from((new Date()).getTime()),
      endTime: UInt64.from((new Date()).getTime() + (3 * 60 * 60 * 1000)),
      candidateCount: UInt32.from(5),
      voterCount: UInt32.from(100)
    };

    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.createElection(
        electionProps.startTime,
        electionProps.endTime,
        electionProps.candidateCount,
        electionProps.voterCount
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    expect(zkAppInstance.election.get().startTime.toFields()).toEqual(electionProps.startTime.toFields());
    expect(zkAppInstance.election.get().endTime.toFields()).toEqual(electionProps.endTime.toFields());
    expect(zkAppInstance.election.get().candidateCount).toEqual(electionProps.candidateCount);
    expect(zkAppInstance.election.get().voterCount).toEqual(electionProps.voterCount);
  });
});
