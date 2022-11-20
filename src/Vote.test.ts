import { Vote } from './Vote';
import {
  isReady,
  Mina,
  shutdown,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  UInt32
} from 'snarkyjs';

let voters: PublicKey[];
const electionProps = {
  startTime: UInt64.from((new Date()).getTime()),
  endTime: UInt64.from((new Date()).getTime() + (3 * 60 * 60 * 1000)),
  candidateCount: UInt32.from(5)
};

function createLocalBlockchain() {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  voters = Local.testAccounts.filter((_, i) => i > 0 && i < 4).map(each => each.publicKey);
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
      zkAppInstance.deploy({ zkappKey: zkAppPrivateKey });
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();
  });

  afterAll(async () => {
    setTimeout(shutdown, 0);
  });

  it('generates and deploys the `Vote` smart contract with election params', async () => {
    console.log(voters);

    const txn = await Mina.transaction(deployerAccount, () => {
      zkAppInstance.startElection_test(
        electionProps.startTime,
        electionProps.endTime,
        voters,
        electionProps.candidateCount
      );
      zkAppInstance.sign(zkAppPrivateKey);
    });
    await txn.send();

    console.log(zkAppInstance.voterTreeRoot.get());

    expect(zkAppInstance.startTime.get().toFields()).toEqual(electionProps.startTime.toFields());
    expect(zkAppInstance.endTime.get().toFields()).toEqual(electionProps.endTime.toFields());
    expect(zkAppInstance.candidateCount).toEqual(electionProps.candidateCount);
    expect(zkAppInstance.candidateCount.get()).toEqual(electionProps.candidateCount);
  });
});
